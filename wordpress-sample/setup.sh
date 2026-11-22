#!/usr/bin/env bash
# ローカルに SAMPLE SITE 試作環境を一から作る(WordPress + Lightning + SQLite)。MySQL不要。
# 使い方: bash setup.sh [作成先ディレクトリ(既定 ~/wp-local)]
# 既存のディレクトリがある場合は何も上書きせず中止する。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$HOME/wp-local}"
PORT="${PORT:-8080}"
[ -e "$ROOT/site" ] && { echo "既に $ROOT/site があります。中身を確認してから、別の場所を指定してください。"; exit 1; }
mkdir -p "$ROOT/dl" && cd "$ROOT"
curl -fsSL -o dl/wp.zip        https://wordpress.org/latest.zip
curl -fsSL -o dl/lightning.zip https://downloads.wordpress.org/theme/lightning.zip
curl -fsSL -o dl/sqlite.zip    https://downloads.wordpress.org/plugin/sqlite-database-integration.zip
curl -fsSL -o dl/wpcli.phar    https://github.com/wp-cli/wp-cli/releases/download/v2.11.0/wp-cli-2.11.0.phar
unzip -q dl/wp.zip -d src && mv src/wordpress site && rmdir src
unzip -q dl/sqlite.zip    -d site/wp-content/plugins/
unzip -q dl/lightning.zip -d site/wp-content/themes/
cp -r "$HERE/child-theme/lightning-child-sample" site/wp-content/themes/
P="$ROOT/site/wp-content/plugins/sqlite-database-integration"
cp "$P/db.copy" site/wp-content/db.php
sed -i "s#{SQLITE_IMPLEMENTATION_FOLDER_PATH}#$P#; s#{SQLITE_PLUGIN}#sqlite-database-integration/load.php#" site/wp-content/db.php
cp site/wp-config-sample.php site/wp-config.php
sed -i "s/database_name_here/wp/;s/username_here/wp/;s/password_here/wp/" site/wp-config.php
WP="php -d memory_limit=512M $ROOT/dl/wpcli.phar --path=$ROOT/site"
$WP core install --url="http://localhost:$PORT" --title="SAMPLE SITE" --admin_user=admin --admin_password=admin-local-only --admin_email=admin@example.com --skip-email
$WP theme activate lightning-child-sample
python3 "$HERE/tools/make_placeholders.py"
$WP eval-file "$HERE/seed/setup.php"
echo "完了。起動: php -S 0.0.0.0:$PORT -t $ROOT/site   →  http://localhost:$PORT/ (管理画面 /wp-admin/  admin / admin-local-only)"
