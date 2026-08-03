СРОЧНОЕ ИСПРАВЛЕНИЕ POP ROLL

Причина поломки:
в предыдущем app.js была синтаксическая ошибка: после словаря переводов отсутствовала точка с запятой.
Из-за этого браузер не мог запустить JavaScript, поэтому Mini App выглядел как неработающий.

Загрузите в GitHub поверх старых:
- app.js
- index.html
- server.js
- package.json

После загрузки:
1. Нажмите Commit changes.
2. Дождитесь GitHub Pages 1–2 минуты.
3. Дождитесь Railway Deployment successful.
4. Полностью закройте Telegram Mini App и откройте снова.

Проверено:
- app.js проходит node --check
- server.js проходит node --check
