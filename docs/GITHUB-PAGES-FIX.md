# Как убрать письма об ошибках деплоя

Письма «pages build and deployment: All jobs were cancelled» приходят из-за **старого** workflow в репозитории.

## Сделай один раз

1. Открой репозиторий на GitHub: **hair1guru1school-cyber/AVITOLOG**
2. Вкладка **Actions** (Сверху)
3. Слева в списке найди **«pages build and deployment»**
4. Нажми на него, справа сверху нажми **⋯** (три точки)
5. Выбери **«Disable workflow»**

После этого при запуске `upload_github.py` будет запускаться только workflow **«Deploy to Pages»** — он не отменяется при новом пуше и не шлёт письма об ошибках.

## Настройки Actions

В **Settings → Actions → General** оставь выбранным: **«Allow all actions and reusable workflows»** и нажми **Save**.
