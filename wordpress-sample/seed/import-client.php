<?php
/**
 * クライアント(髙木 晴さん)本人のサイト haltakagi.com の文章と写真を取り込み、仮素材と置き換える。
 * 事前に: python3 tools/prepare_client_images.py (写真を取得し、seed/client-images/ に置く)
 * 実行:   wp eval-file seed/import-client.php   (先に seed/setup.php を実行しておくこと)
 * 何度実行しても重複しない。「ホーム」の本文は、このクライアント版で上書きされる。
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$dir = __DIR__ . '/client-images';
if ( ! is_dir( $dir ) || ! file_exists( $dir . '/hero.jpg' ) ) {
	WP_CLI::error( '写真がありません。先に python3 tools/prepare_client_images.py を実行してください。' );
}

/* ---------- 写真をメディアライブラリへ ---------- */
function client_import_image( $dir, $file, $title, $alt ) {
	$found = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'numberposts' => 1, 'meta_key' => '_client_seed_file', 'meta_value' => $file ) );
	if ( $found ) { return $found[0]->ID; }
	$tmp = wp_tempnam( $file );
	copy( $dir . '/' . $file, $tmp );
	$id = media_handle_sideload( array( 'name' => $file, 'tmp_name' => $tmp ), 0, $title );
	if ( is_wp_error( $id ) ) { WP_CLI::error( $id->get_error_message() ); }
	update_post_meta( $id, '_wp_attachment_image_alt', $alt );
	update_post_meta( $id, '_client_seed_file', $file );
	return $id;
}
$img = array(
	'hero'       => client_import_image( $dir, 'hero.jpg', '髙木晴 メインビジュアル', '夕暮れの海辺に立つ髙木晴' ),
	'profile'    => client_import_image( $dir, 'profile.jpg', '髙木晴 プロフィール', 'ベストボディジャパンでの髙木晴' ),
	'about'      => client_import_image( $dir, 'about.jpg', '髙木晴 芝生', '芝生で集中する髙木晴' ),
	'icebath'    => client_import_image( $dir, 'card-icebath.jpg', '髙木晴 アイスバス', 'アイスバスで笑う髙木晴' ),
	'meditation' => client_import_image( $dir, 'card-meditation.jpg', '髙木晴 瞑想', '青空の下で瞑想する髙木晴' ),
	'hyrox'      => client_import_image( $dir, 'card-hyrox.jpg', '髙木晴 HYROX', 'HYROXのレース中の髙木晴' ),
	'message'    => client_import_image( $dir, 'card-message.jpg', '髙木晴 海辺', '夕暮れの海辺に立つ髙木晴' ),
);
echo 'images: ' . count( $img ) . "\n";

/* ---------- 記事の本文を作る補助 ---------- */
function p( $t ) { return "<!-- wp:paragraph -->\n<p>" . str_replace( "\n", '<br>', $t ) . "</p>\n<!-- /wp:paragraph -->\n\n"; }
function h( $t, $lv = 3 ) { return "<!-- wp:heading {\"level\":$lv} -->\n<h$lv class=\"wp-block-heading\">$t</h$lv>\n<!-- /wp:heading -->\n\n"; }

/* ---------- カテゴリー ---------- */
$cat = array();
foreach ( array( 'コンセプト', 'プログラム', '専門コーチング', 'メッセージ', 'おすすめ' ) as $n ) {
	$t = term_exists( $n, 'category' );
	if ( ! $t ) { $t = wp_insert_term( $n, 'category' ); }
	$cat[ $n ] = (int) ( is_array( $t ) ? $t['term_id'] : $t );
}

/* ---------- 記事(サイトの各セクションを記事として登録) ---------- */
$posts = array(
	array(
		'title' => '「もっと可能性があるはず…」そんな言葉遊び、もう終わりにしませんか？', 'cats' => array( 'コンセプト', 'おすすめ' ), 'img' => 'about', 'age' => 1,
		'body'  => p( "「もっと可能性があるはず…」\n「今度こそ変えよう…」\nそんな言葉遊び、もう終わりにしませんか？" )
			. p( '目標を立てて、一度は漲るようなエネルギーが湧いたものの、そのモチベーションが続くことはない。気がつけばあの時と変わらない日々を送っている…。' )
			. p( '思うような結果が出なかったり、途中で手が止まったり。ただそれは、意志が弱いからではありません。人間の原理原則を正しく理解していないからです。' )
			. p( 'GOAL ACHIEVEMENT PROGRAMは、あなたが本当に叶えたい理想を言葉にして、そこへ向かう日々の行動を設計し、やり切るところまでをデザインするマンツーマンコーチングです。' )
			. p( '仕事でも、恋愛でも、身体づくりでも、テーマは問いません。' ),
	),
	array(
		'title' => 'どの分野でも、どのテーマでも。', 'cats' => array( 'コンセプト' ), 'img' => 'icebath', 'age' => 2,
		'body'  => p( '仕事、家族・パートナー、人間関係、身体、ファイナンス。人生は、いくつもの領域でできています。どの分野でも、どのテーマでも構いません。目標を設定して、一緒に達成しに行きましょう。' )
			. p( 'それぞれの領域の「今の満足度」を10段階でつけてみてください。伸ばしたい領域が、自然と見えてきます。' ),
	),
	array(
		'title' => 'プログラムの流れ（自己理解・GOAL設定・行動設計・習慣化）', 'cats' => array( 'プログラム', 'おすすめ' ), 'img' => 'meditation', 'age' => 3,
		'body'  => h( '01 自己理解／現状認識（KNOW）' ) . p( '対話を重ねて、自分でも気づいてなかった本音を引き出します。現在地を正しく認識することで、正しいGOALを設定できます。' )
			. h( '02 GOAL設定（DECIDE）' ) . p( '誰かの人生ではなく、自分の人生で本当に達成したいGOALを設定します。本音丸出しで、心から獲得したいGOALほど、エネルギーが湧きます。' )
			. h( '03 行動設計（DESIGN）' ) . p( '理想と現状、そのGAPを明確にし、「今週何をやるか」「今日はどんな1日にするか」まで落とし込み、アクションで現実を動かします。' )
			. h( '04 習慣化（KEEP）' ) . p( 'なぜモチベーションが続かなかったのか。その理由を明確にし、科学に基づく手法で、行動が当たり前に続く状態をつくります。' ),
	),
	array(
		'title' => '専門コーチング（恋愛・パートナーシップ／身体）', 'cats' => array( '専門コーチング', 'おすすめ' ), 'img' => 'hyrox', 'age' => 4,
		'body'  => p( '同じ4つのステップを、人生の特定の領域に絞って深める専門コーチングも行っています。' )
			. h( '家族・パートナーの領域：LOVE &amp; PARTNERSHIP' ) . p( '恋愛も、人生の大切な目標のひとつ。' ) . p( '自分の恋愛パターンを知ることから、出会い・パートナーとの理想の関係性まで。恋愛・パートナーシップに特化したコーチングです。' )
			. h( '身体の領域：BODY &amp; MIND' ) . p( '身体を変えて、現実を動かす。' ) . p( '身体を土台に、呼吸・感情・思考・信念までアプローチ。自分自身が心から惚れる身体をつくるパーソナルプログラムです。' ),
	),
	array(
		'title' => '一度きりの人生を、どう生きたいか。', 'cats' => array( 'メッセージ' ), 'img' => 'message', 'age' => 5,
		'body'  => p( "思いっきり仕事に熱中してもいい。\n仲間とデカい目標を追いかけたっていい。\n海の近くに住んで、サーフィンに人生を賭けてもいい。\n惚れ惚れするような身体をつくったっていい。\n大切な人とゆっくり食事を楽しんでもいい。\n一人でじっくり本を読む時間を味わってもいい。" )
			. p( "どんな人生を生きたっていい。\n人生は自由だ。" )
			. p( "他の誰のものでもない、自分の人生なんだから。\n自分が心から「やりたい」と思えることを、大切にしてほしい。" )
			. p( "僕自身、そんな人生を生きたいと思っています。\n仕事も、家族との時間も、趣味も、遊びも。\n全部、本気で楽しみたい。夢中になりたい。" )
			. p( 'そして、あなたにも問いたい。' )
			. p( "あなたにとっての成功とは何ですか？\nあなたにとっての幸せとは何ですか？" )
			. p( "すぐに答えが出なくてもいい。\nうまく言葉にできなくてもいい。" )
			. p( "「本当はこう生きたい」「こうなりたい」\nその想いを、一つひとつの選択と行動に変えて、\nあなたが心から望む人生を、一緒に現実にしていこう。" )
			. p( '髙木 晴' ),
	),
);
$now = time();
foreach ( $posts as $p ) {
	if ( get_page_by_title( $p['title'], OBJECT, 'post' ) ) { continue; }
	$pid = wp_insert_post( array(
		'post_title' => $p['title'], 'post_content' => $p['body'], 'post_status' => 'publish', 'post_type' => 'post',
		'post_date' => gmdate( 'Y-m-d H:i:s', $now - $p['age'] * DAY_IN_SECONDS ),
		'post_category' => array_map( function ( $n ) use ( $cat ) { return $cat[ $n ]; }, $p['cats'] ),
	) );
	set_post_thumbnail( $pid, $img[ $p['img'] ] );
}
echo "posts ok\n";

/* ---------- トップページ(クライアント版の本文で上書き) ---------- */
$home_id = (int) get_option( '_sample_home_page_id' );
$blog = get_page_by_path( 'blog' );
$bg = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'numberposts' => 1, 'meta_key' => '_sample_seed_file', 'meta_value' => 'test-recommend-bg.jpg' ) );
if ( ! $home_id || ! $blog || ! $bg ) { WP_CLI::error( '先に seed/setup.php を実行してください。' ); }
$html = strtr( file_get_contents( __DIR__ . '/front-page-client.html' ), array(
	'{{HERO_URL}}' => wp_get_attachment_url( $img['hero'] ), '{{HERO_ID}}' => $img['hero'],
	'{{BG_URL}}' => wp_get_attachment_url( $bg[0]->ID ), '{{BG_ID}}' => $bg[0]->ID,
	'{{PROFILE_URL}}' => wp_get_attachment_url( $img['profile'] ), '{{PROFILE_ID}}' => $img['profile'],
	'{{BLOG_URL}}' => get_permalink( $blog->ID ), '{{REC_CAT_ID}}' => $cat['おすすめ'],
) );
wp_update_post( array( 'ID' => $home_id, 'post_content' => wp_slash( $html ) ) );

/* ---------- サイト名・ロゴ・フッター ---------- */
update_option( 'blogname', 'HAL TAKAGI' );
update_option( 'blogdescription', 'オールライフ目標達成コーチング' );
$lo = get_option( 'lightning_theme_options', array() );
unset( $lo['head_logo'] ); // 仮ロゴを外し、サイト名の文字を表示
update_option( 'lightning_theme_options', $lo );
$wb = get_option( 'widget_block', array() );
$wb[100] = array( 'content' => "<!-- wp:heading {\"level\":3} -->\n<h3 class=\"wp-block-heading\">HAL TAKAGI</h3>\n<!-- /wp:heading -->\n\n<!-- wp:paragraph -->\n<p>オールライフ目標達成コーチ　髙木 晴</p>\n<!-- /wp:paragraph -->" );
update_option( 'widget_block', $wb );

/* ---------- 仮素材の削除(置き換え) ---------- */
$del = 0;
foreach ( get_posts( array( 'post_type' => 'post', 'post_status' => 'any', 'numberposts' => -1, 's' => '【テスト記事】' ) ) as $t ) {
	if ( 0 === strpos( $t->post_title, '【テスト記事】' ) ) { wp_delete_post( $t->ID, true ); $del++; }
}
foreach ( array( 'test-hero.jpg', 'test-profile.jpg', 'test-logo.png', 'test-thumb-01.jpg', 'test-thumb-02.jpg', 'test-thumb-03.jpg', 'test-thumb-04.jpg', 'test-thumb-05.jpg', 'test-thumb-06.jpg' ) as $f ) {
	foreach ( get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'numberposts' => -1, 'meta_key' => '_sample_seed_file', 'meta_value' => $f ) ) as $a ) { wp_delete_attachment( $a->ID, true ); $del++; }
}
foreach ( array( 'お知らせ', '活動紹介', 'ブログ' ) as $n ) { // 仮カテゴリーのうち、記事が0件のものを削除
	$t = get_term_by( 'name', $n, 'category' );
	if ( $t && 0 === (int) $t->count ) { wp_delete_term( $t->term_id, 'category' ); }
}
echo "deleted dummy items: $del\n";
echo "home page id=$home_id\n";
