# Provider clarification requests — drafts only

**Status:** prepared for review; NOT sent.  
**Date:** 2026-11-23

These messages request factual clarification only. They do not attach datasets, disclose API keys, or authorize a purchase or subscription.

## 1. Valuebetennis — round-code semantics

Recipient: support@valuebetennis.com  
Subject: Clarification of the `tour` round codes in the historical match CSV

### English draft

Hello,

I am auditing the historical ATP/WTA match CSVs published on Valuebetennis and would appreciate clarification of the `tour` field.

Your documentation describes `tour` as the draw round, from 0 (pre-qualifying) to 12 (final), but I could not find a complete mapping for the intermediate values.

Could you please confirm the exact meaning of codes 1, 2, 3 and 4? In particular:
- Do codes 1, 2 and 3 represent the first, second and third qualifying rounds (Q1, Q2 and Q3)?
- Does code 4 represent the first main-draw round?
- Is this mapping consistent across ATP, WTA, Challenger and ITF events, or does it vary by competition/category?

I will use your clarification only to document the dataset schema and assess historical coverage. I will not redistribute the raw data.

Thank you.

### Русский перевод

Здравствуйте!

Я провожу аудит исторических CSV-файлов матчей ATP/WTA, опубликованных на Valuebetennis, и хотел бы уточнить значение поля `tour`.

В документации сказано, что оно обозначает раунд сетки — от 0 (предварительная квалификация) до 12 (финал), однако полной расшифровки промежуточных значений я не нашёл.

Подтвердите, пожалуйста, точное значение кодов 1, 2, 3 и 4:
- Обозначают ли коды 1, 2 и 3 первый, второй и третий раунды квалификации (Q1, Q2, Q3)?
- Обозначает ли код 4 первый раунд основной сетки?
- Одинакова ли эта расшифровка для ATP, WTA, Challenger и ITF или она зависит от категории соревнования?

Ваш ответ будет использован только для документирования структуры данных и оценки исторического покрытия. Сырые данные я распространять не буду.

Спасибо.

---

## 2. Live Tennis API — retention and model-training rights

Recipient: provider support/contact form  
Subject: Written clarification: historical API data retention and model training

### English draft

Hello,

I currently have access to the Live Tennis API Basic plan. Before using any historical results in a research dataset, I would like written clarification of the applicable data-use permissions.

The Terms of Use appear to grant a limited right to use API responses within an application and restrict caching or storing data beyond what is reasonably necessary to operate that application.

Could you please confirm whether my current plan and terms permit the following:
1. Downloading historical match results, including qualifying, Challenger and Futures matches.
2. Retaining those match records in a private research database after the API response has been received.
3. Using the retained match records to train and validate a machine-learning model that calculates tennis match probabilities.
4. Retaining model parameters and aggregate statistical features derived from those records after the source records are deleted.
5. Using the resulting model in a publicly accessible or potentially commercial application.

If any of these activities require a separate licence, institutional affiliation, additional payment or written approval, please specify the applicable conditions and fees.

I will not begin a persistent historical import or model-training use unless the permissions are confirmed in writing.

Thank you.

### Русский перевод

Здравствуйте!

В настоящее время у меня есть доступ к Live Tennis API по тарифу Basic. Прежде чем использовать исторические результаты в исследовательской базе, я хотел бы получить письменное разъяснение условий использования данных.

Насколько я понимаю, условия предоставляют ограниченное право использовать ответы API внутри приложения и ограничивают кэширование или хранение данных сверх того, что необходимо для работы приложения.

Прошу письменно подтвердить, разрешают ли мой тариф и действующие условия следующие действия:
1. Загружать исторические результаты, включая квалификацию, Challenger и Futures.
2. Хранить записи матчей в закрытой исследовательской базе после получения ответа API.
3. Использовать сохранённые записи для обучения и проверки модели машинного обучения, рассчитывающей вероятности теннисных матчей.
4. Сохранять параметры модели и агрегированные статистические признаки, полученные из этих записей, после удаления исходных данных.
5. Использовать полученную модель в общедоступном или потенциально коммерческом приложении.

Если для каких-либо действий требуется отдельная лицензия, институциональная принадлежность, дополнительная оплата или письменное разрешение, прошу сообщить соответствующие условия и стоимость.

До получения письменного подтверждения я не буду создавать постоянный исторический архив из этих данных или использовать их для обучения модели.

Спасибо.

## Sending gate

Neither message has been sent. The Valuebetennis address is listed above. For Live Tennis API, use the provider's official contact route: https://livetennisapi.com/contact

Send only after explicit user approval. No files or personal account details need to be attached.
