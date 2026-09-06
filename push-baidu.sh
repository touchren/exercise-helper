#!/bin/bash
# 百度站长平台 sitemap 推送脚本
# 每日配额 10 条；推送不保证收录，只加快爬虫发现速度
# 用法：./push-baidu.sh
# 如推送新页面，往 URLS 数组里加即可

set -e

SITE="https://exercise.touchren.pub"
TOKEN="GokWf0y2Jfz84pU8"
API="http://data.zz.baidu.com/urls?site=${SITE}&token=${TOKEN}"

# 待推送 URL 列表（按需增删）
URLS=(
  "https://exercise.touchren.pub/"
  "https://exercise.touchren.pub/morning/"
  "https://exercise.touchren.pub/evening/"
  "https://exercise.touchren.pub/guide.html"
)

BODY=""
for u in "${URLS[@]}"; do
  BODY+="${u}"$'\n'
done

echo "=== 推送 ${#URLS[@]} 个 URL 到百度 ==="
RESP=$(printf '%s' "$BODY" | curl -sS -m 15 -X POST "$API" --data-binary @-)
echo "响应：$RESP"

SUCCESS=$(echo "$RESP" | grep -oP '"success":\K\d+')
REMAIN=$(echo "$RESP" | grep -oP '"remain":\K\d+')
echo ""
echo "成功 $SUCCESS 条，今日剩余 $REMAIN 条"
