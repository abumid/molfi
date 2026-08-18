// Оферта и политика конфиденциальности.
//
// ЭТО ЧЕРНОВИК, А НЕ ЮРИДИЧЕСКИЙ ДОКУМЕНТ. Текст описывает механику
// продукта так, как она устроена в коде, и годится, чтобы показать
// юристу и не объяснять всё с нуля. До запуска обязательна вычитка
// юристом, знающим узбекское регулирование: публичная оферта — это
// договор, а не страница сайта.
//
// Раздел про риски живёт здесь, а не на лендинге — так решил заказчик.
// Но фраза «доход не гарантирован» осталась и на лендинге: обещание
// доходности это обязательство, и прятать его в документ, который
// открывают после решения, нельзя.

const D = {
  en: {
    offer: {
      title: 'Public offer',
      updated: 'Draft. Not yet reviewed by a lawyer.',
      intro: 'This document explains what you get when you buy an asset through Molfi, what you pay, and who carries which risk. Read it before you sign anything.',
      s: [
        ['Who we are',
         'Molfi connects you to a working livestock farm in the Tashkent region. We keep the animals, feed them, and record everything that happens to them. You buy a specific animal and follow it from the app.'],
        ['How a contract begins',
         'You pick an asset in the catalogue, confirm the purchase, and the price is deducted from your Molfi wallet. From that moment the animal is recorded against your name with its RFID tag, and no one else can buy it.'],
        ['Investment',
         'The farm raises your asset. You decide when to sell — the farmer may advise, the decision is yours. When it sells, you receive the proceeds minus the accumulated cost of care. What you get depends on the weight the animal has put on and the price of meat on the day of sale.'],
        ['Ownership',
         'You pay a monthly care fee while the asset is with us. At the end you take it live or as meat, butchered and packed, on the date agreed in the contract. Nothing is sold, so market prices do not affect you.'],
        ['What you pay',
         'The price of the asset at purchase, and 40,000 som per month for care. Under investment the care fee accumulates and is deducted from the sale. Under ownership you pay it monthly from your wallet. There is no commission on top today. If that changes, you will see the new terms before you sign anything.'],
        ['If the asset dies',
         'We provide full care: feed, shelter and veterinary supervision on a schedule. If the asset dies despite that, the loss is yours. There is no insurance behind this today. This is the risk you take on when you buy, and it is why the price of entry is what it is.'],
        ['If meat prices fall',
         'Under investment you may receive less than you hoped, and possibly less than you paid. The weight the animal puts on works in your favour; the market price does not always. Under ownership this does not affect you — you take meat, not money.'],
        ['Returns are not guaranteed',
         'Molfi does not promise any rate of return. Livestock cannot deliver one. Any figure shown in the app is an estimate calculated from current weight and price per kilogram, and it changes.'],
        ['Your money',
         'Funds stay in your Molfi wallet until you commit them to a contract. An uncommitted balance can be withdrawn at any time. Money already in a contract is released when the asset is sold or the contract is closed.'],
        ['Missed care payments',
         'We contact you before anything happens to the contract. The terms for missed payments are written into the agreement you sign.'],
        ['Changes',
         'If we change fees or terms, existing contracts keep the terms they were signed under. New terms apply to new contracts only.'],
        ['Contact', 'hello@molfi.uz'],
      ],
    },
    privacy: {
      title: 'Privacy',
      updated: 'Draft. Not yet reviewed by a lawyer.',
      intro: 'What we collect, why, and what we do not do with it.',
      s: [
        ['What we collect',
         'Your phone number, the name you enter, and — if you sign in through the bot — your Telegram account id and username. Plus the contracts you open and the transactions in your wallet.'],
        ['Why',
         'The phone number identifies your account and receives sign-in codes. The name appears in your profile and in your contracts. Telegram data lets the bot deliver codes and notifications instead of paid SMS.'],
        ['Who else sees it',
         'The SMS gateway sees your phone number and the code text, because it delivers them. Telegram sees what you send the bot. We do not sell your data and do not pass it to advertisers.'],
        ['How long',
         'While your account exists. Contracts and transactions are kept longer — they are financial records, and both sides may need them.'],
        ['Your rights',
         'Write to us and we will show you what we hold, correct it, or delete your account. Contracts already concluded cannot be erased from the financial record.'],
        ['Contact', 'hello@molfi.uz'],
      ],
    },
  },

  ru: {
    offer: {
      title: 'Публичная оферта',
      updated: 'Черновик. Юристом не вычитан.',
      intro: 'Документ объясняет, что вы получаете, покупая актив через Molfi, сколько платите и кто какой риск несёт. Прочитайте до того, как что-то подписывать.',
      s: [
        ['Кто мы',
         'Molfi связывает вас с действующей животноводческой фермой в Ташкентской области. Мы держим животных, кормим их и записываем всё, что с ними происходит. Вы покупаете конкретное животное и следите за ним из приложения.'],
        ['Как начинается договор',
         'Вы выбираете актив в каталоге, подтверждаете покупку, и цена списывается с кошелька Molfi. С этого момента животное записано на вас вместе с его RFID-меткой, и купить его больше никто не может.'],
        ['Инвестиция',
         'Ферма растит ваш актив. Когда продавать — решаете вы; фермер может посоветовать, решение остаётся за вами. При продаже вы получаете выручку за вычетом накопленной платы за содержание. Сколько именно — зависит от набранного веса и цены мяса в день продажи.'],
        ['Владение',
         'Вы платите за уход помесячно, пока актив у нас. В конце забираете его живым или мясом, разделанным и упакованным, в дату из договора. Ничего не продаётся, поэтому рыночные цены вас не касаются.'],
        ['Сколько вы платите',
         'Цену актива при покупке и 40 000 сум в месяц за содержание. При инвестиции плата за содержание копится и вычитается при продаже. При владении вы платите её ежемесячно из кошелька. Никакой комиссии сверху сегодня нет. Если это изменится, вы увидите новые условия до того, как что-то подпишете.'],
        ['Если актив погибнет',
         'Мы обеспечиваем полный уход: кормление, содержание и ветеринарное наблюдение по графику. Если актив всё же погибает, убыток несёте вы. Страхования за этим сегодня нет. Это тот риск, который вы принимаете при покупке, и именно поэтому вход стоит столько, сколько стоит.'],
        ['Если цены на мясо упадут',
         'При инвестиции вы можете получить меньше, чем рассчитывали, и, возможно, меньше вложенного. Набранный вес работает на вас, рыночная цена — не всегда. При владении это вас не касается: вы забираете мясо, а не деньги.'],
        ['Доход не гарантирован',
         'Molfi не обещает никакой ставки доходности. Животноводство её не даёт. Любая цифра в приложении — оценка, посчитанная из текущего веса и цены за килограмм, и она меняется.'],
        ['Ваши деньги',
         'Средства лежат в кошельке Molfi, пока вы не вложили их в договор. Свободный остаток можно вывести в любой момент. Деньги, уже вложенные в договор, освобождаются при продаже актива или закрытии договора.'],
        ['Просрочка платы за содержание',
         'Мы свяжемся с вами прежде, чем с договором что-то произойдёт. Условия по пропущенным платежам записаны в договоре, который вы подписываете.'],
        ['Изменения',
         'Если мы изменим тарифы или условия, действующие договоры сохраняют те условия, на которых были заключены. Новые условия действуют только для новых договоров.'],
        ['Связь', 'hello@molfi.uz'],
      ],
    },
    privacy: {
      title: 'Конфиденциальность',
      updated: 'Черновик. Юристом не вычитан.',
      intro: 'Что мы собираем, зачем и чего с этим не делаем.',
      s: [
        ['Что собираем',
         'Номер телефона, имя, которое вы указали, и — если вы входите через бота — идентификатор аккаунта Telegram и имя пользователя. Плюс договоры, которые вы открываете, и операции в кошельке.'],
        ['Зачем',
         'Номер телефона опознаёт ваш аккаунт и принимает коды входа. Имя показывается в профиле и в договорах. Данные Telegram позволяют боту доставлять коды и уведомления вместо платных SMS.'],
        ['Кто ещё это видит',
         'Шлюз SMS видит ваш номер и текст кода, потому что доставляет их. Telegram видит то, что вы отправляете боту. Мы не продаём ваши данные и не передаём их рекламодателям.'],
        ['Сколько храним',
         'Пока существует ваш аккаунт. Договоры и операции храним дольше — это финансовые записи, и они могут понадобиться обеим сторонам.'],
        ['Ваши права',
         'Напишите нам, и мы покажем, что о вас храним, исправим это или удалим аккаунт. Уже заключённые договоры нельзя стереть из финансовой отчётности.'],
        ['Связь', 'hello@molfi.uz'],
      ],
    },
  },

  uz: {
    offer: {
      title: 'Ommaviy oferta',
      updated: 'Qoralama. Yurist tomonidan ko\'rib chiqilmagan.',
      intro: 'Ushbu hujjat Molfi orqali aktiv sotib olganingizda nima olishingizni, qancha to\'lashingizni va qaysi xavfni kim ko\'tarishini tushuntiradi. Biror narsani imzolashdan oldin o\'qing.',
      s: [
        ['Biz kimmiz',
         'Molfi sizni Toshkent viloyatidagi ishlab turgan chorvachilik fermasi bilan bog\'laydi. Biz hayvonlarni saqlaymiz, boqamiz va ular bilan sodir bo\'lgan hamma narsani yozib boramiz. Siz aniq bir hayvonni sotib olasiz va uni ilovadan kuzatasiz.'],
        ['Shartnoma qanday boshlanadi',
         'Katalogdan aktiv tanlaysiz, xaridni tasdiqlaysiz va narx Molfi hamyoningizdan yechiladi. Shu paytdan hayvon RFID belgisi bilan sizning nomingizga yoziladi va uni boshqa hech kim sotib ololmaydi.'],
        ['Investitsiya',
         'Ferma aktivingizni boqadi. Qachon sotishni siz hal qilasiz — fermer maslahat berishi mumkin, qaror sizniki. Sotilganda tushumni olasiz, undan to\'plangan parvarish haqi ushlab qolinadi. Qancha olishingiz hayvon qo\'shgan vaznga va sotish kunidagi go\'sht narxiga bog\'liq.'],
        ['Egalik',
         'Aktiv bizda turgan vaqtda oylik parvarish haqini to\'laysiz. Oxirida uni tirik yoki go\'sht sifatida — so\'yilgan va qadoqlangan holda — shartnomadagi sanada olasiz. Hech narsa sotilmaydi, shuning uchun bozor narxlari sizga ta\'sir qilmaydi.'],
        ['Qancha to\'laysiz',
         'Xarid paytida aktiv narxini va parvarish uchun oyiga 40 000 so\'m. Investitsiyada parvarish haqi to\'planadi va sotuvdan ushlanadi. Egalikda uni har oy hamyondan to\'laysiz. Bugun ustiga hech qanday komissiya yo\'q. Agar bu o\'zgarsa, yangi shartlarni imzolashdan oldin ko\'rasiz.'],
        ['Agar aktiv nobud bo\'lsa',
         'Biz to\'liq parvarishni ta\'minlaymiz: yem, saqlash va jadval bo\'yicha veterinar nazorati. Shunga qaramay aktiv nobud bo\'lsa, zararni siz ko\'tarasiz. Bugun buning ortida sug\'urta yo\'q. Bu sotib olishda o\'z zimmangizga oladigan tavakkal.'],
        ['Agar go\'sht narxi tushsa',
         'Investitsiyada kutganingizdan kam, ehtimol kiritganingizdan ham kam olishingiz mumkin. Qo\'shilgan vazn sizga ishlaydi, bozor narxi doim emas. Egalikda bu sizga tegishli emas: siz pul emas, go\'sht olasiz.'],
        ['Daromad kafolatlanmagan',
         'Molfi hech qanday daromad stavkasini va\'da qilmaydi. Chorvachilik uni bermaydi. Ilovadagi har qanday raqam joriy vazn va kilogramm narxidan hisoblangan taxmin bo\'lib, u o\'zgarib turadi.'],
        ['Sizning pulingiz',
         'Mablag\'lar shartnomaga kiritilmaguncha Molfi hamyoningizda turadi. Bo\'sh qoldiqni istagan paytda yechib olish mumkin. Shartnomaga kiritilgan pul aktiv sotilganda yoki shartnoma yopilganda ozod bo\'ladi.'],
        ['Parvarish to\'lovi kechikkanda',
         'Shartnoma bilan biror narsa sodir bo\'lishidan oldin siz bilan bog\'lanamiz. Kechiktirilgan to\'lovlar shartlari siz imzolaydigan shartnomada yozilgan.'],
        ['O\'zgarishlar',
         'Agar biz tariflar yoki shartlarni o\'zgartirsak, amaldagi shartnomalar imzolangan shartlarini saqlaydi. Yangi shartlar faqat yangi shartnomalarga tegishli.'],
        ['Aloqa', 'hello@molfi.uz'],
      ],
    },
    privacy: {
      title: 'Maxfiylik',
      updated: 'Qoralama. Yurist tomonidan ko\'rib chiqilmagan.',
      intro: 'Nimani yig\'amiz, nima uchun va u bilan nima qilmaymiz.',
      s: [
        ['Nimani yig\'amiz',
         'Telefon raqamingiz, kiritgan ismingiz va — bot orqali kirsangiz — Telegram hisobingiz identifikatori hamda foydalanuvchi nomi. Shuningdek ochgan shartnomalaringiz va hamyondagi operatsiyalar.'],
        ['Nima uchun',
         'Telefon raqami hisobingizni aniqlaydi va kirish kodlarini qabul qiladi. Ism profilingizda va shartnomalarda ko\'rinadi. Telegram ma\'lumotlari botga pullik SMS o\'rniga kod va bildirishnomalarni yetkazish imkonini beradi.'],
        ['Yana kim ko\'radi',
         'SMS shlyuzi raqamingizni va kod matnini ko\'radi, chunki ularni yetkazadi. Telegram botga yuborganingizni ko\'radi. Biz ma\'lumotlaringizni sotmaymiz va reklama beruvchilarga bermaymiz.'],
        ['Qancha saqlaymiz',
         'Hisobingiz mavjud bo\'lgunicha. Shartnomalar va operatsiyalar uzoqroq saqlanadi — bu moliyaviy yozuvlar va ikkala tomonga ham kerak bo\'lishi mumkin.'],
        ['Sizning huquqlaringiz',
         'Bizga yozing — sizda nima saqlanayotganini ko\'rsatamiz, tuzatamiz yoki hisobingizni o\'chiramiz. Tuzilgan shartnomalarni moliyaviy hisobotdan o\'chirib bo\'lmaydi.'],
        ['Aloqa', 'hello@molfi.uz'],
      ],
    },
  },
}

export const useLegal = (language, doc) => (D[language] || D.en)[doc]
