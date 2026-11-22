<?php
/**
 * Lightning Child Sample
 * 親テーマは編集せず、CSS の読み込みとトップページ用クラスの付与だけを行う。
 * ページの文章・画像は WordPress の固定ページ(ブロックエディター)で管理する。
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'wp_enqueue_scripts',
	function () {
		$file = get_stylesheet_directory() . '/assets/front.css';
		wp_enqueue_style(
			'lightning-child-sample',
			get_stylesheet_directory_uri() . '/assets/front.css',
			array(),
			file_exists( $file ) ? filemtime( $file ) : '0.1.0'
		);
	},
	20
);

// トップページ用の小さなスクリプト(新着記事スライダー / タブ)
add_action(
	'wp_enqueue_scripts',
	function () {
		if ( ! is_front_page() ) {
			return;
		}
		foreach ( array( 'slider', 'tabs' ) as $name ) {
			$file = get_stylesheet_directory() . '/assets/' . $name . '.js';
			wp_enqueue_script(
				'lightning-child-sample-' . $name,
				get_stylesheet_directory_uri() . '/assets/' . $name . '.js',
				array(),
				file_exists( $file ) ? filemtime( $file ) : '0.1.0',
				array( 'in_footer' => true, 'strategy' => 'defer' )
			);
		}
	},
	20
);

// トップページ(固定ページ)だけに適用するクラス
add_filter(
	'body_class',
	function ( $classes ) {
		if ( is_front_page() ) {
			$classes[] = 'sample-front';
		}
		return $classes;
	}
);

// 抜粋の文末記号
add_filter( 'excerpt_more', function () { return '…'; } );
