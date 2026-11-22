<?php
/**
 * 仮素材の投入スクリプト(WP-CLI の `wp eval-file` で実行)。
 * 何度実行しても重複しないようにしてある(タイトル/ファイル名で存在確認)。
 * 既存の投稿・固定ページを消したり上書きしたりはしない(自分が作ったものだけ更新)。
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$seed = __DIR__;
$log  = function ( $m ) { echo $m . "\n"; };

update_option( 'permalink_structure', '/%postname%/' );
global $wp_rewrite; $wp_rewrite->set_permalink_structure( '/%postname%/' );

/* ---------- 画像をメディアライブラリへ ---------- */
function sample_import_image( $file, $title, $alt ) {
	$existing = get_posts( array(
		'post_type' => 'attachment', 'post_status' => 'inherit', 'numberposts' => 1,
		'meta_key' => '_sample_seed_file', 'meta_value' => $file,
	) );
	if ( $existing ) { return $existing[0]->ID; }
	$src = __DIR__ . '/images/' . $file;
	$tmp = wp_tempnam( $file );
	copy( $src, $tmp );
	$id = media_handle_sideload( array( 'name' => $file, 'tmp_name' => $tmp ), 0, $title );
	if ( is_wp_error( $id ) ) { WP_CLI::error( $id->get_error_message() ); }
	update_post_meta( $id, '_wp_attachment_image_alt', $alt );
	update_post_meta( $id, '_sample_seed_file', $file );
	return $id;
}

$img = array();
$defs = array(
	'hero'    => array( 'test-hero.jpg', 'テスト用 メインビジュアル', '紺色のグラデーションで作った、メインビジュアル用の仮画像' ),
	'bg'      => array( 'test-recommend-bg.jpg', 'テスト用 おすすめ記事の背景', '' ),
	'profile' => array( 'test-profile.jpg', 'テスト用 プロフィール人物', '人物のシルエットを描いた、プロフィール用の仮画像' ),
	'logo'    => array( 'test-logo.png', 'テスト用 ロゴ', 'SAMPLE SITE（仮ロゴ）' ),
);
for ( $i = 1; $i <= 6; $i++ ) {
	$defs[ "t$i" ] = array( sprintf( 'test-thumb-%02d.jpg', $i ), sprintf( 'テスト用 記事画像 %02d', $i ), sprintf( 'テスト用の仮画像 %02d（グラデーションの抽象図形）', $i ) );
}
foreach ( $defs as $k => $d ) { $img[ $k ] = sample_import_image( $d[0], $d[1], $d[2] ); }
$log( 'images: ' . count( $img ) );

/* ---------- WordPress初期インストールのサンプルを削除(未編集のものだけ) ---------- */
$hello = get_page_by_path( 'hello-world', OBJECT, 'post' );
if ( $hello && 'Hello world!' === $hello->post_title ) { wp_delete_post( $hello->ID, true ); }
$sample = get_page_by_path( 'sample-page', OBJECT, 'page' );
if ( $sample && 'Sample Page' === $sample->post_title ) { wp_delete_post( $sample->ID, true ); }

/* ---------- カテゴリー ---------- */
$cats = array();
foreach ( array( '活動紹介', 'ブログ', 'お知らせ', 'おすすめ' ) as $n ) {
	$t = term_exists( $n, 'category' );
	if ( ! $t ) { $t = wp_insert_term( $n, 'category' ); }
	$cats[ $n ] = (int) ( is_array( $t ) ? $t['term_id'] : $t );
}
// 既定カテゴリー「未分類」は残す(削除しない)

/* ---------- ダミー記事 6件 ---------- */
$posts = array(
	array( '【テスト記事】はじめまして、SAMPLE SITE です', array( 'お知らせ' ), 't1', 'これはテスト用の記事です。サイトの試作中に表示を確認するために作成しました。内容は実在の活動を表すものではありません。' ),
	array( '【テスト記事】活動紹介のページ構成を考える', array( '活動紹介', 'おすすめ' ), 't2', 'これはテスト用の記事です。活動紹介をどのような順番で見せるか、仮の文章で並べています。正式な内容は後から差し替えます。' ),
	array( '【テスト記事】ブログの書き方メモ（仮）', array( 'ブログ' ), 't3', 'これはテスト用の記事です。見出し・段落・画像の入れ方を確認するための仮の文章です。' ),
	array( '【テスト記事】写真を選ぶときのポイント（仮）', array( 'ブログ', 'おすすめ' ), 't4', 'これはテスト用の記事です。画像の比率や明るさがカードにどう表示されるかを確認します。' ),
	array( '【テスト記事】お知らせの書き方サンプル', array( 'お知らせ' ), 't5', 'これはテスト用の記事です。お知らせ記事のカード表示を確認するためのダミーです。' ),
	array( '【テスト記事】これからの予定（仮）', array( '活動紹介', 'おすすめ' ), 't6', 'これはテスト用の記事です。今後の予定を載せる場合の見え方を確認します。内容はすべて架空です。' ),
);
$base = time() - 6 * DAY_IN_SECONDS;
foreach ( $posts as $i => $p ) {
	$found = get_page_by_title( $p[0], OBJECT, 'post' );
	if ( $found ) { continue; }
	$body = "<!-- wp:paragraph -->\n<p>{$p[3]}</p>\n<!-- /wp:paragraph -->\n\n"
		. "<!-- wp:paragraph -->\n<p>この記事は仮のものです。管理画面の「投稿」から編集・削除できます。</p>\n<!-- /wp:paragraph -->";
	$pid = wp_insert_post( array(
		'post_title' => $p[0], 'post_content' => $body, 'post_status' => 'publish', 'post_type' => 'post',
		'post_date' => gmdate( 'Y-m-d H:i:s', $base + $i * DAY_IN_SECONDS ) ,
		'post_category' => array_map( function ( $n ) use ( $cats ) { return $cats[ $n ]; }, $p[1] ),
	) );
	set_post_thumbnail( $pid, $img[ $p[2] ] );
}
$log( 'posts ok' );

/* ---------- 固定ページ: ホーム / ブログ ---------- */
$blog = get_page_by_path( 'blog' );
$blog_id = $blog ? $blog->ID : wp_insert_post( array( 'post_title' => 'ブログ', 'post_name' => 'blog', 'post_status' => 'publish', 'post_type' => 'page', 'post_content' => '' ) );

$html = file_get_contents( $seed . '/front-page.html' );
$rep = array(
	'{{HERO_URL}}' => wp_get_attachment_url( $img['hero'] ), '{{HERO_ID}}' => $img['hero'],
	'{{BG_URL}}' => wp_get_attachment_url( $img['bg'] ), '{{BG_ID}}' => $img['bg'],
	'{{PROFILE_URL}}' => wp_get_attachment_url( $img['profile'] ), '{{PROFILE_ID}}' => $img['profile'],
	'{{BLOG_URL}}' => get_permalink( $blog_id ), '{{REC_CAT_ID}}' => $cats['おすすめ'],
);
$html = strtr( $html, $rep );

$home_id = (int) get_option( '_sample_home_page_id' );
if ( ! $home_id || ! get_post( $home_id ) ) {
	$home_id = wp_insert_post( array( 'post_title' => 'ホーム', 'post_name' => 'home', 'post_status' => 'publish', 'post_type' => 'page', 'post_content' => wp_slash( $html ) ) );
	update_option( '_sample_home_page_id', $home_id );
} else {
	// 初回投入時の本文だけ再投入したいとき用: 環境変数 SAMPLE_RESET_HOME=1
	if ( getenv( 'SAMPLE_RESET_HOME' ) ) { wp_update_post( array( 'ID' => $home_id, 'post_content' => wp_slash( $html ) ) ); }
}
// Lightning: トップは 1カラム・余白なし
update_post_meta( $home_id, '_lightning_design_setting', array( 'layout' => 'col-one-no-subsection', 'site_body_padding' => 'true' ) );

update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $home_id );
update_option( 'page_for_posts', $blog_id );
update_option( 'blogname', 'SAMPLE SITE' );
update_option( 'blogdescription', '個人事業主の活動紹介とブログ（試作サイト）' );
update_option( 'timezone_string', 'Asia/Tokyo' );
update_option( 'date_format', 'Y年n月j日' );

/* ---------- メニュー(ページ内リンクのみ) ---------- */
$items = array( array( '最新記事', '#latest' ), array( 'おすすめ', '#recommend' ), array( 'プロフィール', '#profile' ) );
$make_menu = function ( $name ) use ( $items ) {
	$m = wp_get_nav_menu_object( $name );
	if ( $m ) { return $m->term_id; }
	$id = wp_create_nav_menu( $name );
	foreach ( $items as $it ) {
		wp_update_nav_menu_item( $id, 0, array( 'menu-item-title' => $it[0], 'menu-item-url' => home_url( '/' ) . $it[1], 'menu-item-type' => 'custom', 'menu-item-status' => 'publish' ) );
	}
	return $id;
};
$loc = get_nav_menu_locations();
$loc['global-nav'] = $make_menu( 'メインメニュー（試作）' );
$loc['footer-nav'] = $make_menu( 'フッターメニュー（試作）' );
set_theme_mod( 'nav_menu_locations', $loc );

/* ---------- Lightning設定: デモスライダーを非表示 ---------- */
$lo = get_option( 'lightning_theme_options', array() );
$lo['top_slide_display'] = 'hide';
$lo['head_logo'] = wp_get_attachment_url( $img['logo'] ); // 画像はメディアライブラリのもの
update_option( 'lightning_theme_options', $lo );

/* ---------- フッターのウィジェット(初期のアーカイブ/カテゴリーを外し、仮のサイト紹介に) ---------- */
$wb = get_option( 'widget_block', array() );
$wb[100] = array( 'content' => "<!-- wp:heading {\"level\":3} -->\n<h3 class=\"wp-block-heading\">SAMPLE SITE</h3>\n<!-- /wp:heading -->\n\n<!-- wp:paragraph -->\n<p>個人事業主の活動紹介とブログ（試作用の仮サイトです）</p>\n<!-- /wp:paragraph -->" );
$wb['_multiwidget'] = 1;
update_option( 'widget_block', $wb );
$sw = get_option( 'sidebars_widgets', array() );
$sw['footer-before-widget'] = array();
$sw['footer-widget-1'] = array( 'block-100' );
update_option( 'sidebars_widgets', $sw );
flush_rewrite_rules();

$log( "home page id=$home_id blog page id=$blog_id  rec cat=" . $cats['おすすめ'] );
