# 星級遊戲 QR 收集冊

- 開啟：雙擊 `start.bat`（需要 Python），瀏覽器會開 http://localhost:8080/
- 新增 QR：`node scripts/add-codes.mjs "<貼上任何文字／網址／12 碼 id>"`
  - 已存在的自動略過；新增的預設是「未兌換」
- 兌換狀態 = 你手動設定的值（存在瀏覽器 localStorage）?? 資料預設值（`codes.json` 的 `redeemed` 欄位；原始 118 筆為 true，新增的為 false）
  - 所以更新資料不會動到你已經手動改過的項目
