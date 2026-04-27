import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROXY_BASE = "https://fudo-test.matiaskweller.workers.dev";
const PROXY_SECRET = "masunori-fudo-proxy-2026";

type Lang = "en" | "ru";
interface KvItem { id: string; name: string; price: number; description?: string; }
interface MenuData { version: string; pages: Array<{ id: string; title: string; sections: Array<{ id: string; title: string; subtitle?: string; items: KvItem[]; }>; }>; }

function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function unesc(s: string): string { return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }

// ── ITEM NAME TRANSLATIONS (shown as "Original · translation") ──
const nameTranslations: Record<Lang, Record<string, string>> = {
  en: {
    "Shiromi":"White fish","Langostino":"Shrimp","Trucha":"Trout","Atún Rojo":"Red Tuna","Atun Rojo":"Red Tuna","Wagyu":"Wagyu Beef","Vieiras":"Scallops",
    "Pepino":"Cucumber","Palta":"Avocado","Hongos":"Mushrooms","Mango":"Mango","Tofu":"Tofu",
    "Clásico":"Classic","Clasico":"Classic","Kosher":"Kosher","Veggie":"Veggie","Teen":"Teen",
    "Masu":"Chef's Selection","Trucha & Palta":"Trout & Avocado","Trucha &amp; Palta":"Trout & Avocado",
    "Atún Rojo & Palta":"Red Tuna & Avocado","Atún Rojo &amp; Palta":"Red Tuna & Avocado",
    "Akashi":"White Fish Tiradito","CarPassion":"Passion Fruit Tiradito","Masu Lime":"Truffle Lime Tiradito",
    "Ikura":"Salmon Roe","Centolla":"King Crab","Omakase":"Omakase",
    "Rock Shrimp Tempura ½":"Rock Shrimp Tempura ½","Rock Shrimp Tempura":"Rock Shrimp Tempura",
    "Wok de Pollo":"Chicken Wok","Wok de Trucha":"Trout Wok","Shiromi Satsumaimo":"White Fish & Sweet Potato","Sopa Miso":"Miso Soup",
    "Clásico shiromi del día":"Classic White Fish","Clasico shiromi del dia":"Classic White Fish",
    "Clásico trucha":"Classic Trout","Clasico trucha":"Classic Trout",
    "Shiromi nikkei":"Nikkei White Fish","Shiromi trufa":"Truffle White Fish",
    "Trucha teriyaki":"Teriyaki Trout","Trucha trufa":"Truffle Trout",
    "Ebi":"Shrimp","Gravlax":"Smoked Trout","Niguiri Maguro":"Red Tuna Nigiri",
    "Crispy Rice Trucha":"Crispy Rice Trout","Crispy Rice Atún Rojo":"Crispy Rice Red Tuna","Crispy Rice Atun Rojo":"Crispy Rice Red Tuna",
    "Tako":"Octopus","Unagi":"Eel","Moriwase × 8":"Tasting × 8","Moriwase x 8":"Tasting × 8",
    "Avocado Trucha":"Avocado Trout Roll","Masumaki":"Masumaki Roll","Passion":"Passion Fruit Roll",
    "Buenos Aires Trucha":"Buenos Aires Trout Roll","Buenos Aires Shrimp":"Buenos Aires Shrimp Roll",
    "Avocado Shrimp":"Avocado Shrimp Roll","Roll Crocante":"Crispy Roll","Crispy Crab":"Crispy Crab Roll","Hosomaki":"Hosomaki Roll",
    "Alfajor Negro":"Dark Chocolate Alfajor","Alfajor Pistacho":"Pistachio Alfajor",
    "Helado":"Ice Cream","Bocha de Helado":"Ice Cream Scoop","Tiramisú":"Tiramisú","Tiramisu":"Tiramisú",
    "Cheesecake Dulce de leche":"Dulce de Leche Cheesecake","Cheesecake Chocolate Godiva":"Godiva Chocolate Cheesecake",
    "Flan de dulce de leche":"Dulce de Leche Flan",
    "Té de sabores":"Flavored Tea","Te de sabores":"Flavored Tea","Té verde en hebras":"Green Tea","Te verde en hebras":"Green Tea",
    "Expreso":"Espresso","Café cortado":"Cortado","Cafe cortado":"Cortado","Lágrima":"Lágrima","Lagrima":"Lágrima",
    "Agua sin gas / con gas":"Still / Sparkling Water","Coca Original / Zero":"Coca Cola","Sprite / Sprite Zero":"Sprite",
    "Schwepps pomelo o tónica":"Grapefruit or Tonic","Schwepps pomelo o tonica":"Grapefruit or Tonic",
    "Limonada menta y jengibre":"Mint & Ginger Lemonade","Pomelada":"Grapefruit Lemonade",
    "Natsu Marubekku":"Summer Ball","Jingoku Spicy":"Spicy Hell","Pisco Ringo":"Pisco Apple",
    "Midori Sake":"Melon Sake","Daikokku":"Fortune God","Umeshu Tonic":"Plum Wine Tonic",
    "Masuteen":"Kids Menu","Handroll × 4":"Handroll × 4","Handroll × 6":"Handroll × 6",
    "× 4 + Niguiris":"× 4 + Nigiri","Ceviche clásico":"Classic Ceviche","Ceviche Clásico":"Classic Ceviche",
    "Ceviche especial":"Special Ceviche","Ceviche Trucha + Bebida":"Trout Ceviche + Drink",
    "Tiradito + Roll":"Tiradito + Roll","Chirashi":"Chirashi","Chirashi Kosher":"Kosher Chirashi",
    "Wasabi":"Wasabi Ceviche","Nikkei":"Nikkei Ceviche","Rocoto":"Rocoto Ceviche",
  },
  ru: {
    "Shiromi":"Белая рыба","Langostino":"Креветка","Trucha":"Форель","Atún Rojo":"Красный тунец","Atun Rojo":"Красный тунец","Wagyu":"Говядина вагю","Vieiras":"Гребешки",
    "Pepino":"Огурец","Palta":"Авокадо","Hongos":"Грибы","Mango":"Манго","Tofu":"Тофу",
    "Clásico":"Классический","Clasico":"Классический","Kosher":"Кошерный","Veggie":"Вегетарианский","Teen":"Детский",
    "Masu":"Выбор шефа","Trucha & Palta":"Форель и авокадо","Trucha &amp; Palta":"Форель и авокадо",
    "Atún Rojo & Palta":"Тунец и авокадо","Atún Rojo &amp; Palta":"Тунец и авокадо",
    "Akashi":"Тирадито из белой рыбы","CarPassion":"Тирадито маракуйя","Masu Lime":"Тирадито трюфель и лайм",
    "Ikura":"Икра лосося","Centolla":"Камчатский краб","Omakase":"Омакасэ",
    "Rock Shrimp Tempura ½":"Креветки темпура ½","Rock Shrimp Tempura":"Креветки темпура",
    "Wok de Pollo":"Вок с курицей","Wok de Trucha":"Вок с форелью","Shiromi Satsumaimo":"Белая рыба с бататом","Sopa Miso":"Мисо суп",
    "Clásico shiromi del día":"Классический из белой рыбы","Clasico shiromi del dia":"Классический из белой рыбы",
    "Clásico trucha":"Классический из форели","Clasico trucha":"Классический из форели",
    "Shiromi nikkei":"Белая рыба никкей","Shiromi trufa":"Белая рыба с трюфелем",
    "Trucha teriyaki":"Форель терияки","Trucha trufa":"Форель с трюфелем",
    "Ebi":"Креветка","Gravlax":"Копчёная форель","Niguiri Maguro":"Нигири из тунца",
    "Crispy Rice Trucha":"Криспи райс с форелью","Crispy Rice Atún Rojo":"Криспи райс с тунцом","Crispy Rice Atun Rojo":"Криспи райс с тунцом",
    "Tako":"Осьминог","Unagi":"Угорь","Moriwase × 8":"Дегустация × 8","Moriwase x 8":"Дегустация × 8",
    "Avocado Trucha":"Ролл с форелью и авокадо","Masumaki":"Ролл масумаки","Passion":"Ролл маракуйя",
    "Buenos Aires Trucha":"Ролл Буэнос-Айрес с форелью","Buenos Aires Shrimp":"Ролл Буэнос-Айрес с креветкой",
    "Avocado Shrimp":"Ролл с креветкой и авокадо","Roll Crocante":"Хрустящий ролл","Crispy Crab":"Ролл с крабом","Hosomaki":"Хосомаки",
    "Alfajor Negro":"Альфахор тёмный шоколад","Alfajor Pistacho":"Альфахор фисташка",
    "Helado":"Мороженое","Bocha de Helado":"Шарик мороженого","Tiramisú":"Тирамису","Tiramisu":"Тирамису",
    "Cheesecake Dulce de leche":"Чизкейк дульсе де лече","Cheesecake Chocolate Godiva":"Чизкейк шоколад Годива",
    "Flan de dulce de leche":"Флан дульсе де лече",
    "Té de sabores":"Ароматный чай","Te de sabores":"Ароматный чай","Té verde en hebras":"Зелёный чай","Te verde en hebras":"Зелёный чай",
    "Expreso":"Эспрессо","Café cortado":"Кортадо","Cafe cortado":"Кортадо","Lágrima":"Лагрима","Lagrima":"Лагрима",
    "Agua sin gas / con gas":"Вода без газа / с газом","Coca Original / Zero":"Кока-Кола","Sprite / Sprite Zero":"Спрайт",
    "Schwepps pomelo o tónica":"Грейпфрут или тоник","Schwepps pomelo o tonica":"Грейпфрут или тоник",
    "Limonada menta y jengibre":"Лимонад мята и имбирь","Pomelada":"Грейпфрутовый лимонад",
    "Natsu Marubekku":"Летний шар","Jingoku Spicy":"Острый ад","Pisco Ringo":"Писко с яблоком",
    "Midori Sake":"Дынное саке","Daikokku":"Бог удачи","Umeshu Tonic":"Сливовое вино с тоником",
    "Masuteen":"Детское меню","Handroll × 4":"Хэндролл × 4","Handroll × 6":"Хэндролл × 6",
    "× 4 + Niguiris":"× 4 + Нигири","Ceviche clásico":"Классический севиче","Ceviche Clásico":"Классический севиче",
    "Ceviche especial":"Особый севиче","Ceviche Trucha + Bebida":"Севиче из форели + напиток",
    "Tiradito + Roll":"Тирадито + ролл","Chirashi":"Чираши","Chirashi Kosher":"Кошерный чираши",
    "Wasabi":"Севиче васаби","Nikkei":"Севиче никкей","Rocoto":"Севиче рокото",
  }
};

const sectionTitles: Record<Lang, Record<string, string>> = {
  en: { "Handrolls":"Handrolls","Combos Handrolls":"Handroll Combos","Combos Take Away":"Take Away Combos","Chirashi":"Chirashi","Ceviche":"Ceviche","Tartar":"Tartare","Tiraditos":"Tiraditos","Sashimi":"Sashimi","Geisha Ikura":"Geisha Ikura","Gunkans":"Gunkans","Omakase":"Omakase","Platos Calientes":"Hot Dishes","Niguiris":"Nigiri","Rolls":"Rolls","Postres":"Desserts","Infusiones":"Hot Drinks","Sin Alcohol":"Non-Alcoholic","Mocktails":"Mocktails","Tragos":"Cocktails","Tragos de Autor":"Signature Cocktails","Cerveza":"Beer","Sake":"Sake","Whisky":"Whisky","Vinos por Botella":"Wines by Bottle","Vinos por Copa":"Wines by Glass","Espumantes":"Sparkling Wines","Menú Ejecutivo":"Business Lunch" },
  ru: { "Handrolls":"Хэндроллы","Combos Handrolls":"Комбо хэндроллов","Combos Take Away":"Комбо на вынос","Chirashi":"Чираши","Ceviche":"Севиче","Tartar":"Тартар","Tiraditos":"Тирадитос","Sashimi":"Сашими","Geisha Ikura":"Гейша Икура","Gunkans":"Гунканы","Omakase":"Омакасэ","Platos Calientes":"Горячие блюда","Niguiris":"Нигири","Rolls":"Роллы","Postres":"Десерты","Infusiones":"Горячие напитки","Sin Alcohol":"Безалкогольные","Mocktails":"Моктейли","Tragos":"Коктейли","Tragos de Autor":"Авторские коктейли","Cerveza":"Пиво","Sake":"Саке","Whisky":"Виски","Vinos por Botella":"Вина (бутылка)","Vinos por Copa":"Вина (бокал)","Espumantes":"Игристые вина","Menú Ejecutivo":"Бизнес-ланч" }
};

const colHeaders: Record<Lang, Record<string, string>> = {
  en: { "Handrolls":"Handrolls","Combos":"Combos","Combos Take Away":"Take Away Combos","Chirashi · Ceviche":"Chirashi · Ceviche","Tartar · Tiraditos · Sashimi · Gunkans":"Tartare · Tiraditos · Sashimi · Gunkans","Platos Calientes":"Hot Dishes","Niguiris":"Nigiri","Rolls":"Rolls","Postres · Bebidas":"Desserts · Drinks","Tragos":"Cocktails","Cerveza · Sake · Whisky":"Beer · Sake · Whisky","Carta de Vinos":"Wine List","Vinos por Copa · Espumantes":"Wines by Glass · Sparkling","Menú Ejecutivo · Madero":"Business Lunch · Madero","Menú Ejecutivo · Palermo":"Business Lunch · Palermo","Menú Ejecutivo · Belgrano":"Business Lunch · Belgrano","Omakase · Platos Calientes":"Omakase · Hot Dishes" },
  ru: { "Handrolls":"Хэндроллы","Combos":"Комбо","Combos Take Away":"Комбо на вынос","Chirashi · Ceviche":"Чираши · Севиче","Tartar · Tiraditos · Sashimi · Gunkans":"Тартар · Тирадитос · Сашими · Гунканы","Platos Calientes":"Горячие блюда","Niguiris":"Нигири","Rolls":"Роллы","Postres · Bebidas":"Десерты · Напитки","Tragos":"Коктейли","Cerveza · Sake · Whisky":"Пиво · Саке · Виски","Carta de Vinos":"Винная карта","Vinos por Copa · Espumantes":"Вина (бокал) · Игристые","Menú Ejecutivo · Madero":"Бизнес-ланч · Мадеро","Menú Ejecutivo · Palermo":"Бизнес-ланч · Палермо","Menú Ejecutivo · Belgrano":"Бизнес-ланч · Бельграно","Omakase · Platos Calientes":"Омакасэ · Горячие блюда" }
};

const uiMap: Record<Lang, Record<string, string>> = {
  en: { "Precios en pesos · IVA incluido · Informá alergias a nuestro equipo":"Prices in ARS · Tax included · Please inform our team about allergies","12 piezas · 3 pasos":"12 pieces · 3 courses","Primer paso":"First course","Segundo paso":"Second course","Tercer paso":"Third course","× 4 unidades":"× 4 pieces","× 6 unidades":"× 6 pieces","× 8 unidades":"× 8 pieces","× 2 piezas":"× 2 pieces","× 10 piezas":"× 10 pieces","Cada opción incluye agua o gaseosa":"Each option includes water or soda","12 a 16 hs":"12 to 4 PM","exclusivo Puerto Madero":"Puerto Madero exclusive","exclusivo Puerto Madero · Belgrano":"Puerto Madero · Belgrano exclusive","Degustación":"Tasting","Sujeto a disponibilidad del día":"Subject to daily availability","PROTEÍNAS":"PROTEINS","VEGGIE":"VEGGIE","SALSAS":"SAUCES","TOPPINGS":"TOPPINGS","Armá tu Handroll":"Build your Handroll","alga nori &amp; shari":"nori seaweed &amp; sushi rice","alga nori & shari":"nori seaweed & sushi rice" },
  ru: { "Precios en pesos · IVA incluido · Informá alergias a nuestro equipo":"Цены в песо · НДС включён · Сообщите нашей команде об аллергиях","12 piezas · 3 pasos":"12 штук · 3 подачи","Primer paso":"Первая подача","Segundo paso":"Вторая подача","Tercer paso":"Третья подача","× 4 unidades":"× 4 штуки","× 6 unidades":"× 6 штук","× 8 unidades":"× 8 штук","× 2 piezas":"× 2 штуки","× 10 piezas":"× 10 штук","Cada opción incluye agua o gaseosa":"Каждый вариант включает воду или газировку","12 a 16 hs":"с 12 до 16","exclusivo Puerto Madero":"только Пуэрто Мадеро","exclusivo Puerto Madero · Belgrano":"только Пуэрто Мадеро · Бельграно","Degustación":"Дегустация","Sujeto a disponibilidad del día":"В зависимости от наличия","PROTEÍNAS":"ПРОТЕИНЫ","VEGGIE":"ВЕГЕТАРИАНСКОЕ","SALSAS":"СОУСЫ","TOPPINGS":"ТОППИНГИ","Armá tu Handroll":"Собери свой Хэндролл","alga nori &amp; shari":"нори и рис для суши","alga nori & shari":"нори и рис для суши" }
};

const descMap: Record<Lang, Array<[RegExp, string]>> = {
  en: [
    [/\bcristales de sal\b/gi,"salt crystals"],[/\baceite de trufa\b/gi,"truffle oil"],[/\baceite sésamo\b/gi,"sesame oil"],[/\bcebolla morada\b/gi,"red onion"],[/\bleche de tigre\b/gi,"tiger's milk"],[/\bmasa filo\b/gi,"phyllo dough"],[/\bcrema chantilly\b/gi,"whipped cream"],[/\bdulce de leche\b/gi,"dulce de leche"],[/\batún rojo\b/gi,"red tuna"],[/\bpesca blanca\b/gi,"white fish"],[/\bají amarillo\b/gi,"yellow chili"],[/\bají limo\b/gi,"limo chili"],[/\bmiel de pomelo\b/gi,"grapefruit honey"],[/\bmayo spicy\b/gi,"spicy mayo"],[/\bpuré de boniato\b/gi,"sweet potato purée"],[/\bbase crocante de shari\b/gi,"crispy sushi rice base"],[/\bporción completa\b/gi,"full portion"],[/\bniguiris clásicos\b/gi,"classic nigiri"],[/\ba elección del sushiman\b/gi,"chef's choice"],[/\ba elección\b/gi,"of your choice"],[/\bquinoa crocante\b/gi,"crispy quinoa"],[/\bmanteca batayaki\b/gi,"batayaki butter"],[/\balmíbar de pomelo\b/gi,"grapefruit syrup"],[/\bacompañad[ao] (de |con )?/gi,"served with "],[/\brosa de palta\b/gi,"avocado rose"],[/\bMedia porción\b/gi,"Half portion"],[/\bláminas de\b/gi,"slices of "],[/\bCubos de\b/gi,"Cubes of "],[/\bhilos de\b/gi,"threads of "],[/\bfrutos secos\b/gi,"nuts"],[/\bsalsa cítrica de wasabi\b/gi,"citrus wasabi sauce"],[/\bsalsa nikkei\b/gi,"nikkei sauce"],[/\bsalsa de maracuyá\b/gi,"passion fruit sauce"],[/\bsalsa teriyaki\b/gi,"teriyaki sauce"],[/\bsalsa de\b/gi,"sauce of "],[/\bsalsa\b/gi,"sauce"],[/\bsalsas y toppings\b/gi,"sauces and toppings"],[/\bchili jam\b/gi,"chili jam"],[/\bmanteca ahumada\b/gi,"smoked butter"],[/\bcobertura de palta\b/gi,"avocado topping"],[/\bcubierto de trucha\b/gi,"topped with trout"],[/\bcubierto de\b/gi,"topped with "],
    [/\btrucha\b/gi,"trout"],[/\bshiromi\b/gi,"white fish"],[/\blangostinos?\b/gi,"shrimp"],[/\bvieiras\b/gi,"scallops"],[/\bpepino\b/gi,"cucumber"],[/\bpalta\b/gi,"avocado"],[/\bhongos?\b/gi,"mushrooms"],[/\bmango\b/gi,"mango"],[/\btofu\b/gi,"tofu"],[/\bnori\b/gi,"nori"],[/\bshari\b/gi,"sushi rice"],[/\bpulpo\b/gi,"octopus"],[/\banguila\b/gi,"eel"],[/\bcentolla\b/gi,"king crab"],[/\bhuevas curadas en soja con wasabi\b/gi,"roe cured in soy with wasabi"],[/\bhuevas\b/gi,"roe"],[/\bqueso\b/gi,"cheese"],[/\bjengibre\b/gi,"ginger"],[/\blima\b/gi,"lime"],[/\bsésamo\b/gi,"sesame"],[/\bmaracuyá\b/gi,"passion fruit"],[/\bcilantro\b/gi,"cilantro"],[/\bciboulette\b/gi,"chives"],[/\bechalotte\b/gi,"shallot"],[/\bgohan\b/gi,"rice"],[/\bzanahoria\b/gi,"carrot"],[/\bcebolla\b/gi,"onion"],[/\bhuevo\b/gi,"egg"],[/\bboniato\b/gi,"sweet potato"],[/\bcafé\b/gi,"coffee"],[/\bchocolate\b/gi,"chocolate"],[/\bpomelo\b/gi,"grapefruit"],[/\bcarne\b/gi,"beef"],[/\bpistacho\b/gi,"pistachio"],[/\bmenta\b/gi,"mint"],[/\btónica\b/gi,"tonic"],[/\bpicante\b/gi,"spicy"],[/\bcrocante\b/gi,"crispy"],[/\btrufa\b/gi,"truffle"],[/\bflamead[ao]\b/gi,"torched"],[/\bfurai\b/gi,"fried"],[/\bmacha\b/gi,"matcha"],[/\bnegui\b/gi,"scallion"],[/\bFilet de\b/gi,"Fillet of "],[/\bwagyu\b/gi,"wagyu"],[/\barroz\b/gi,"rice"],[/\brocoto\b/gi,"rocoto"],[/\bralladura de\b/gi,"zest of "],[/\bralladura cítrica\b/gi,"citrus zest"],[/\bcristal de sal\b/gi,"salt crystal"],[/\bcon reserva para evitar demoras\b/gi,"reservation recommended"],[/\bmayonesa de albahaca\b/gi,"basil mayonnaise"],[/\bajo confitado\b/gi,"garlic confit"],[/\bshitake\b/gi,"shiitake"],[/\bchaucha\b/gi,"green beans"],[/\bchoclo\b/gi,"corn"],[/\btempura\b/gi,"tempura"],[/\babura\b/gi,"abura"],[/\bkurusupi\b/gi,"crispy bits"],[/\bfurikake\b/gi,"furikake"],[/\btogarashi\b/gi,"togarashi"],[/\bteriyaki\b/gi,"teriyaki"],[/\bsoja\b/gi,"soy"],[/\bsal marina\b/gi,"sea salt"]
  ],
  ru: [
    [/\bcristales de sal\b/gi,"кристаллы соли"],[/\baceite de trufa\b/gi,"трюфельное масло"],[/\baceite sésamo\b/gi,"кунжутное масло"],[/\bcebolla morada\b/gi,"красный лук"],[/\bleche de tigre\b/gi,"тигровое молоко"],[/\bmasa filo\b/gi,"тесто фило"],[/\bcrema chantilly\b/gi,"взбитые сливки"],[/\bdulce de leche\b/gi,"дульсе де лече"],[/\batún rojo\b/gi,"красный тунец"],[/\bpesca blanca\b/gi,"белая рыба"],[/\bají amarillo\b/gi,"жёлтый перец"],[/\bají limo\b/gi,"перец лимо"],[/\bmiel de pomelo\b/gi,"грейпфрутовый мёд"],[/\bmayo spicy\b/gi,"острый майонез"],[/\bpuré de boniato\b/gi,"пюре из батата"],[/\bbase crocante de shari\b/gi,"хрустящая основа из риса"],[/\bporción completa\b/gi,"полная порция"],[/\bniguiris clásicos\b/gi,"классических нигири"],[/\ba elección del sushiman\b/gi,"выбор шеф-повара"],[/\ba elección\b/gi,"на выбор"],[/\bquinoa crocante\b/gi,"хрустящая киноа"],[/\bmanteca batayaki\b/gi,"масло батаяки"],[/\balmíbar de pomelo\b/gi,"грейпфрутовый сироп"],[/\bacompañad[ao] (de |con )?/gi,"подаётся с "],[/\brosa de palta\b/gi,"роза из авокадо"],[/\bMedia porción\b/gi,"Половина порции"],[/\bláminas de\b/gi,"ломтики "],[/\bCubos de\b/gi,"Кубики "],[/\bhilos de\b/gi,"нити "],[/\bfrutos secos\b/gi,"орехи"],[/\bsalsa cítrica de wasabi\b/gi,"цитрусовый соус васаби"],[/\bsalsa nikkei\b/gi,"соус никкей"],[/\bsalsa de maracuyá\b/gi,"соус из маракуйи"],[/\bsalsa teriyaki\b/gi,"соус терияки"],[/\bsalsa de\b/gi,"соус из "],[/\bsalsa\b/gi,"соус"],[/\bsalsas y toppings\b/gi,"соусы и топпинги"],[/\bchili jam\b/gi,"перечный джем"],[/\bmanteca ahumada\b/gi,"копчёное масло"],[/\bcobertura de palta\b/gi,"покрытие из авокадо"],[/\bcubierto de trucha\b/gi,"покрыт форелью"],[/\bcubierto de\b/gi,"покрыт "],
    [/\btrucha\b/gi,"форель"],[/\bshiromi\b/gi,"белая рыба"],[/\blangostinos?\b/gi,"креветки"],[/\bvieiras\b/gi,"гребешки"],[/\bpepino\b/gi,"огурец"],[/\bpalta\b/gi,"авокадо"],[/\bhongos?\b/gi,"грибы"],[/\bmango\b/gi,"манго"],[/\btofu\b/gi,"тофу"],[/\bnori\b/gi,"нори"],[/\bshari\b/gi,"рис для суши"],[/\bpulpo\b/gi,"осьминог"],[/\banguila\b/gi,"угорь"],[/\bcentolla\b/gi,"камчатский краб"],[/\bhuevas curadas en soja con wasabi\b/gi,"икра в соевом соусе с васаби"],[/\bhuevas\b/gi,"икра"],[/\bqueso\b/gi,"сыр"],[/\bjengibre\b/gi,"имбирь"],[/\blima\b/gi,"лайм"],[/\bsésamo\b/gi,"кунжут"],[/\bmaracuyá\b/gi,"маракуйя"],[/\bcilantro\b/gi,"кинза"],[/\bciboulette\b/gi,"шнитт-лук"],[/\bechalotte\b/gi,"шалот"],[/\bgohan\b/gi,"рис"],[/\bzanahoria\b/gi,"морковь"],[/\bcebolla\b/gi,"лук"],[/\bhuevo\b/gi,"яйцо"],[/\bboniato\b/gi,"батат"],[/\bcafé\b/gi,"кофе"],[/\bchocolate\b/gi,"шоколад"],[/\bpomelo\b/gi,"грейпфрут"],[/\bcarne\b/gi,"мясо"],[/\bpistacho\b/gi,"фисташка"],[/\bmenta\b/gi,"мята"],[/\btónica\b/gi,"тоник"],[/\bpicante\b/gi,"острый"],[/\bcrocante\b/gi,"хрустящий"],[/\btrufa\b/gi,"трюфель"],[/\bflamead[ao]\b/gi,"обожжённая"],[/\bfurai\b/gi,"фрай"],[/\bmacha\b/gi,"матча"],[/\bnegui\b/gi,"лук-порей"],[/\bFilet de\b/gi,"Филе "],[/\bwagyu\b/gi,"вагю"],[/\barroz\b/gi,"рис"],[/\brocoto\b/gi,"рокото"],[/\bralladura de\b/gi,"цедра "],[/\bralladura cítrica\b/gi,"цитрусовая цедра"],[/\bcristal de sal\b/gi,"кристалл соли"],[/\bcon reserva para evitar demoras\b/gi,"рекомендуется бронирование"],[/\bmayonesa de albahaca\b/gi,"майонез с базиликом"],[/\bajo confitado\b/gi,"чесночное конфи"],[/\bshitake\b/gi,"шиитаке"],[/\bchaucha\b/gi,"стручковая фасоль"],[/\bchoclo\b/gi,"кукуруза"],[/\btempura\b/gi,"темпура"],[/\babura\b/gi,"абура"],[/\bkurusupi\b/gi,"хрустящая крошка"],[/\bfurikake\b/gi,"фурикакэ"],[/\btogarashi\b/gi,"тогараши"],[/\bteriyaki\b/gi,"терияки"],[/\bsoja\b/gi,"соевый соус"],[/\bsal marina\b/gi,"морская соль"]
  ]
};

function trDesc(text: string, lang: Lang): string {
  let r = text;
  for (const [rx, rep] of descMap[lang]) r = r.replace(rx, rep);
  return r;
}

function trName(name: string, lang: Lang): string {
  // Return "Original · Translation" or just original if no translation
  const clean = name.replace(/&amp;/g, "&");
  const t = nameTranslations[lang][clean] || nameTranslations[lang][name];
  if (!t || t === clean) return name;
  return `${name} <span style="font-weight:300;font-style:italic;color:var(--muted);font-size:0.85em">· ${esc(t)}</span>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang: lp } = await params;
  if (lp !== "en" && lp !== "ru") return new NextResponse("Not found", { status: 404 });
  const lang: Lang = lp;

  try {
    const htmlPath = path.join(process.cwd(), "public/menu-print.html");
    let html = fs.readFileSync(htmlPath, "utf-8");

    const kvById = new Map<string, KvItem>();
    let hasKv = false;
    try {
      const res = await fetch(`${PROXY_BASE}/menu-data`, { headers: { "X-Proxy-Secret": PROXY_SECRET }, cache: "no-store" });
      if (res.ok) {
        const data: MenuData = await res.json();
        if (data?.pages) { hasKv = true; for (const p of data.pages) for (const s of p.sections) for (const i of s.items) kvById.set(i.id, i); }
      }
    } catch { /* */ }

    html = html.replace(/<html lang="es">/, `<html lang="${lang}">`);
    const lines = html.split("\n");
    const out: string[] = [];

    for (let line of lines) {
      // ── Translate col-header-label ──
      const chm = line.match(/(<div class="col-header-label">)([^<]+)(<\/div>)/);
      if (chm) { const t = colHeaders[lang][chm[2].trim()] ?? chm[2].trim(); line = line.replace(/(<div class="col-header-label">)[^<]+(<\/div>)/, `$1${t}$2`); }

      // ── Translate section-title ──
      const stm = line.match(/(<div class="section-title">)([^<]+)\s*(<span class="section-sub">)([^<]+)(<\/span><\/div>)/);
      if (stm) {
        const tt = sectionTitles[lang][stm[2].trim()] ?? stm[2].trim();
        const ts = uiMap[lang][stm[4].trim()] ?? stm[4].trim();
        line = line.replace(/(<div class="section-title">)[^<]+\s*(<span class="section-sub">)[^<]+(<\/span><\/div>)/, `$1${tt} $2${ts}$3`);
      } else {
        const sts = line.match(/(<div class="section-title">)([^<]+)(<\/div>)/);
        if (sts) { const tt = sectionTitles[lang][sts[2].trim()] ?? sts[2].trim(); line = line.replace(/(<div class="section-title">)[^<]+(<\/div>)/, `$1${tt}$2`); }
      }

      // ── Translate subsection-title ──
      const ssm = line.match(/(<div class="subsection-title">)([^<]+)(<\/div>)/);
      if (ssm) { const t = uiMap[lang][ssm[2].trim()] ?? ssm[2].trim(); line = line.replace(/(<div class="subsection-title">)[^<]+(<\/div>)/, `$1${t}$2`); }

      // ── Translate footer ──
      const fm = line.match(/(<div class="col-footer-line2">)([^<]+)(<\/div>)/);
      if (fm) { const t = uiMap[lang][fm[2].trim()] ?? fm[2].trim(); line = line.replace(/(<div class="col-footer-line2">)[^<]+(<\/div>)/, `$1${t}$2`); }

      // ── Translate Omakase highlight ──
      const km = line.match(/(<div class="highlight-kicker">)([^<]+)(<\/div>)/);
      if (km) { const t = uiMap[lang][km[2].trim()] ?? km[2].trim(); line = line.replace(/(<div class="highlight-kicker">)[^<]+(<\/div>)/, `$1${t}$2`); }
      const slm = line.match(/(<div class="highlight-step-label">)([^<]+)(<\/div>)/);
      if (slm) { const t = uiMap[lang][slm[2].trim()] ?? slm[2].trim(); line = line.replace(/(<div class="highlight-step-label">)[^<]+(<\/div>)/, `$1${t}$2`); }
      const sdm = line.match(/(<div class="highlight-step-desc">)([^<]+)(<\/div>)/);
      if (sdm) { line = line.replace(/(<div class="highlight-step-desc">)[^<]+(<\/div>)/, `$1${trDesc(unesc(sdm[2].trim()), lang)}$2`); }

      // ── Translate fixed UI strings ──
      for (const [es, t] of Object.entries(uiMap[lang])) {
        if (line.includes(es) && !line.includes('data-menu-id')) line = line.split(es).join(t);
      }

      // ── Process items with data-menu-id ──
      const idM = line.match(/data-menu-id="([^"]+)"/);
      if (idM) {
        const id = idM[1];
        const kv = kvById.get(id);

        if (hasKv && !kv) { line = line.replace(/<div class="item"/, '<div class="item" style="display:none"'); line = line.replace(/<span class="build-item"/, '<span class="build-item" style="display:none"'); out.push(line); continue; }

        const itemName = kv?.name || "";

        // Replace item-name with "Original · Translation"
        const nameWithTag = line.match(/(<div class="item-name">)([^<]*)(<span class="tag">)/);
        const nameSimple = line.match(/(<div class="item-name">)([^<]+)(<\/div>)/);
        if (nameWithTag) {
          const orig = kv ? esc(kv.name) : nameWithTag[2].trim();
          const translated = trName(orig, lang);
          line = line.replace(/(<div class="item-name">)[^<]*(<span class="tag">)/, `$1${translated} $2`);
        } else if (nameSimple) {
          const orig = kv ? esc(kv.name) : nameSimple[2].trim();
          const translated = trName(orig, lang);
          line = line.replace(/(<div class="item-name">)[^<]+(<\/div>)/, `$1${translated}$2`);
        }

        // Replace build-item name with translation
        if (/class="build-item"/.test(line) && /data-menu-id/.test(line)) {
          const bm = line.match(/(<span class="build-item"[^>]*>)([^<]+)(<\/span>)/);
          if (bm) {
            const orig = kv ? kv.name : unesc(bm[2].trim());
            const t = nameTranslations[lang][orig];
            const newName = t ? `${esc(orig)} <span style="font-weight:300;font-style:italic;font-size:0.85em">· ${esc(t)}</span>` : esc(orig);
            // Remove old content and insert new (need to handle the span structure)
            line = line.replace(/(<span class="build-item"[^>]*>)[^<]+(<\/span>)/, `$1${newName}$2`);
          }
        }

        // Translate highlight-title
        if (/class="highlight-title"/.test(line)) {
          const htm = line.match(/(<div class="highlight-title"[^>]*>)[^<]+(<\/div>)/);
          if (htm) {
            const name = kv?.name || "Omakase";
            const t = sectionTitles[lang][name] ?? name;
            line = line.replace(/(<div class="highlight-title"[^>]*>)[^<]+(<\/div>)/, `$1${t}$2`);
          }
        }

        // Translate description
        if (/class="item-desc"/.test(line)) {
          const dm = line.match(/<div class="item-desc">([^<]+)/);
          if (dm) {
            const src = kv?.description || unesc(dm[1].trim());
            const translated = trDesc(src, lang);
            line = line.replace(/(<div class="item-desc">)[^<]+/, `$1${esc(translated)}`);
          }
        }

        // Translate tags
        for (const [es, t] of Object.entries(uiMap[lang])) {
          if (line.includes(es) && /exclusivo|Degustación|Sujeto/.test(es)) line = line.split(es).join(t);
        }

        // REMOVE ALL PRICES
        line = line.replace(/(<div class="item-price">)[^<]*(<\/div>)/g, "$1$2");
        line = line.replace(/(<span style="[^"]*font-weight:600[^"]*">)\$[\d.]+(<\/span>)/g, "$1$2");
      }

      // Remove highlight-price
      if (/class="highlight-price"/.test(line)) line = line.replace(/(<div class="highlight-price">)[^<]*(<\/div>)/, "$1$2");
      // Remove combo upgrade prices
      line = line.replace(/(<strong[^>]*>)\$[\d.]+(<\/strong>)/g, "$1$2");

      out.push(line);
    }

    return new NextResponse(out.join("\n"), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Translated menu error:", e);
    return new NextResponse("Error", { status: 500 });
  }
}
