@echo off
chcp 65001 >nul
echo 開啟 http://localhost:8080/  （關閉此視窗即停止）
start "" http://localhost:8080/
python -m http.server 8080 || py -m http.server 8080
