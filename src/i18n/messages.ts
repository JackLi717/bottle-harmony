/** Columns follow LANGUAGES. Public UI copy; internal calibration reports stay technical. */
export const LANGUAGES = [
  { id: 'en', name: 'English' }, { id: 'zh-Hans', name: '简体中文' }, { id: 'zh-Hant', name: '繁體中文' },
  { id: 'es', name: 'Español' }, { id: 'pt', name: 'Português' }, { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' }, { id: 'ja', name: '日本語' }, { id: 'ko', name: '한국어' },
  { id: 'ru', name: 'Русский' }, { id: 'ar', name: 'العربية' }, { id: 'hi', name: 'हिन्दी' }, { id: 'id', name: 'Bahasa Indonesia' },
] as const;
export type Language = typeof LANGUAGES[number]['id'];
export type LanguagePreference = Language | 'system';
type Translations = readonly [string, string, string, string, string, string, string, string, string, string, string, string, string];
export const MESSAGES = {
  home: ['Home','主页','首頁','Inicio','Início','Accueil','Startseite','ホーム','홈','Главная','الرئيسية','मुख्य पृष्ठ','Beranda'],
  back: ['Back','返回','返回','Volver','Voltar','Retour','Zurück','戻る','뒤로','Назад','رجوع','वापस','Kembali'],
  levels: ['Levels','关卡','關卡','Niveles','Níveis','Niveaux','Level','レベル','레벨','Уровни','المراحل','स्तर','Level'],
  settings: ['Settings','设置','設定','Ajustes','Configurações','Réglages','Einstellungen','設定','설정','Настройки','الإعدادات','सेटिंग्स','Pengaturan'],
  close: ['Close','关闭','關閉','Cerrar','Fechar','Fermer','Schließen','閉じる','닫기','Закрыть','إغلاق','बंद करें','Tutup'],
  undo: ['Undo','撤销','復原','Deshacer','Desfazer','Annuler','Zurück','戻す','되돌리기','Отмена','تراجع','पूर्ववत','Urungkan'],
  hint: ['Hint','提示','提示','Pista','Dica','Indice','Tipp','ヒント','힌트','Подсказка','تلميح','संकेत','Petunjuk'],
  reset: ['Restart','重来','重來','Reiniciar','Recomeçar','Rejouer','Neustart','やり直す','다시 시작','Заново','إعادة','फिर शुरू','Ulangi'],
  searching: ['Finding…','寻找中…','尋找中…','Buscando…','Buscando…','Recherche…','Suche…','探索中…','찾는 중…','Поиск…','جارٍ البحث…','खोज जारी…','Mencari…'],
  undoHint: ['Undo the last pour','撤销上一步','復原上一步','Deshacer el último vertido','Desfazer a última jogada','Annuler le dernier versement','Letzten Zug zurücknehmen','最後の移し替えを戻す','마지막 붓기 되돌리기','Отменить последний перелив','التراجع عن آخر سكب','आखिरी चाल पूर्ववत करें','Urungkan tuangan terakhir'],
  hintHint: ['Show one pour','提示并演示一步倒水','提示並示範一步倒水','Mostrar un vertido','Mostrar uma jogada','Montrer un versement','Einen Zug zeigen','一手を見せる','한 수 보여주기','Показать один перелив','عرض خطوة سكب','एक चाल दिखाएँ','Tampilkan satu tuangan'],
  resetHint: ['Restart this level','重新开始本关','重新開始本關','Reiniciar este nivel','Recomeçar este nível','Recommencer ce niveau','Dieses Level neu starten','このレベルをやり直す','이 레벨 다시 시작','Начать уровень заново','إعادة هذه المرحلة','यह स्तर फिर शुरू करें','Mulai ulang level ini'],
  next: ['Next level','下一关','下一關','Siguiente','Próximo nível','Suivant','Weiter','次のレベル','다음 레벨','Далее','المرحلة التالية','अगला स्तर','Level berikutnya'],
  resume: ['Return to game','回到主线','回到主線','Volver al juego','Voltar ao jogo','Retour au jeu','Zurück zum Spiel','ゲームに戻る','게임으로 돌아가기','Вернуться к игре','العودة للعبة','खेल में लौटें','Kembali ke permainan'],
  replayLevels: ['Replay levels','重玩关卡','重玩關卡','Repetir niveles','Rejogar níveis','Rejouer les niveaux','Level wiederholen','レベルを再プレイ','레벨 다시 하기','Повторить уровни','إعادة المراحل','स्तर फिर खेलें','Mainkan ulang level'],
  finished: ['Beautifully sorted!','漂亮！色彩归位','漂亮！色彩歸位','¡Qué bien ordenado!','Cores em harmonia!','Quelle belle harmonie !','Wunderschön sortiert!','きれいに揃いました！','멋지게 정리했어요!','Прекрасная гармония!','انسجام جميل!','रंग सजा दिए!','Warna tersusun indah!'],
  finalFinished: ['All 1,000 levels complete!','一千关，全部完成！','一千關，全部完成！','¡1.000 niveles completados!','1.000 níveis concluídos!','1 000 niveaux terminés !','Alle 1.000 Level geschafft!','全1,000レベルクリア！','1,000개 레벨 완료!','Все 1 000 уровней пройдены!','اكتملت المراحل الألف!','सभी 1,000 स्तर पूरे!','Semua 1.000 level selesai!'],
  shortFinished: ['Well done!','色彩归位！','色彩歸位！','¡Muy bien!','Muito bem!','Bravo !','Geschafft!','クリア！','성공!','Готово!','أحسنت!','बहुत अच्छा!','Berhasil!'],
  goal: ['{done} of {total} colors sorted','已归位 {done} 种颜色，共 {total} 种','已歸位 {done} 種顏色，共 {total} 種','{done} de {total} colores ordenados','{done} de {total} cores organizadas','{done} couleurs sur {total} triées','{done} von {total} Farben sortiert','{total}色中{done}色が完成','{total}가지 색 중 {done}가지 완료','Собрано цветов: {done} из {total}','تم ترتيب {done} من {total} ألوان','{total} में से {done} रंग सजे','{done} dari {total} warna tersusun'],
  moves: ['Pours: {n}','倒水 {n} 次','倒水 {n} 次','Vertidos: {n}','Jogadas: {n}','Versements : {n}','Züge: {n}','移し替え：{n}回','붓기: {n}회','Переливов: {n}','عدد مرات السكب: {n}','चालें: {n}','Tuangan: {n}'],
  objective: ['One color, one full bottle','把每种颜色装满一瓶','把每種顏色裝滿一瓶','Un color por botella','Uma cor por garrafa','Une couleur par bouteille','Eine Farbe pro Flasche','色ごとに瓶をいっぱいに','한 병에 한 가지 색을 채워요','Один цвет в каждой бутылке','لون واحد في كل زجاجة','हर बोतल में एक रंग भरें','Satu warna di setiap botol'],
  tapStart: ['Tap a bottle, then its destination','点选有水的瓶子，再点目标瓶','點選有水的瓶子，再點目標瓶','Toca una botella y luego su destino','Toque uma garrafa e depois o destino','Touchez une bouteille, puis sa destination','Flasche antippen, dann das Ziel','瓶を選び、移し先をタップ','병을 선택한 뒤 목적지를 누르세요','Нажмите на бутылку, затем на цель','اختر زجاجة ثم وجهتها','बोतल चुनें, फिर दूसरी बोतल छुएँ','Ketuk botol, lalu tujuannya'],
  pourTarget: ['Choose an empty bottle or matching top color','再点空瓶，或顶部同色的瓶子','再點空瓶，或頂部同色的瓶子','Elige una botella vacía o del mismo color arriba','Escolha uma garrafa vazia ou com a mesma cor no topo','Choisissez une bouteille vide ou de même couleur en haut','Leere Flasche oder gleiche Farbe oben wählen','空の瓶か、一番上が同じ色の瓶へ','빈 병이나 맨 위가 같은 색인 병을 선택하세요','Выберите пустую бутылку или с тем же цветом сверху','اختر زجاجة فارغة أو بنفس اللون في الأعلى','खाली बोतल या ऊपर समान रंग वाली बोतल चुनें','Pilih botol kosong atau warna atas yang sama'],
  gentle: ['Let matching colors meet','慢慢来，让相同的颜色相遇','慢慢來，讓相同的顏色相遇','Junta los colores iguales','Una as cores iguais','Réunissez les mêmes couleurs','Gleiche Farben zusammenbringen','同じ色を集めましょう','같은 색을 모아 보세요','Соединяйте одинаковые цвета','اجمع الألوان المتشابهة','समान रंगों को मिलाएँ','Satukan warna yang sama'],
  stalled: ['No pours available. Try undo or restart','暂时无处可倒，试试撤销或重来','暫時無處可倒，試試復原或重來','Sin movimientos. Deshaz o reinicia','Sem jogadas. Desfaça ou recomece','Plus de coup. Annulez ou rejouez','Kein Zug möglich. Zurück oder Neustart','移せません。戻すか、やり直しましょう','부을 곳이 없어요. 되돌리거나 다시 시작하세요','Нет ходов. Отмените ход или начните заново','لا توجد خطوات. تراجع أو أعد المرحلة','कोई चाल नहीं। पूर्ववत करें या फिर शुरू करें','Tidak ada tuangan. Urungkan atau ulangi'],
  emptySource: ['Choose a bottle with liquid first','先选一个有水的瓶子','先選一個有水的瓶子','Elige primero una botella con líquido','Escolha primeiro uma garrafa com líquido','Choisissez une bouteille contenant du liquide','Zuerst eine gefüllte Flasche wählen','まず液体の入った瓶を選んでください','먼저 물이 든 병을 선택하세요','Сначала выберите бутылку с жидкостью','اختر أولاً زجاجة بها سائل','पहले भरी हुई बोतल चुनें','Pilih botol berisi cairan dahulu'],
  fullBottle: ['This bottle is full','这个瓶子已经装满了','這個瓶子已經裝滿了','Esta botella está llena','Esta garrafa está cheia','Cette bouteille est pleine','Diese Flasche ist voll','この瓶はいっぱいです','이 병은 가득 찼어요','Эта бутылка полная','هذه الزجاجة ممتلئة','यह बोतल भरी है','Botol ini penuh'],
  undone: ['Last pour undone','已退回上一步','已復原上一步','Último vertido deshecho','Última jogada desfeita','Dernier versement annulé','Letzter Zug zurückgenommen','一手戻しました','한 수 되돌렸어요','Последний перелив отменён','تم التراجع عن آخر سكب','आखिरी चाल पूर्ववत हुई','Tuangan terakhir diurungkan'],
  searchLimit: ['No hint found yet. Try undo or restart','暂未找到提示，试试撤销或重来','暫未找到提示，試試復原或重來','Sin pista por ahora. Deshaz o reinicia','Sem dica por enquanto. Desfaça ou recomece','Pas encore d’indice. Annulez ou rejouez','Noch kein Tipp. Zurück oder Neustart','ヒントが見つかりません。戻すかやり直しましょう','힌트를 찾지 못했어요. 되돌리거나 다시 시작하세요','Подсказка не найдена. Отмените ход или начните заново','لم نجد تلميحاً بعد. تراجع أو أعد المرحلة','संकेत नहीं मिला। पूर्ववत करें या फिर शुरू करें','Belum ada petunjuk. Urungkan atau ulangi'],
  loading: ['Preparing the colors…','正在准备色彩…','正在準備色彩…','Preparando colores…','Preparando as cores…','Préparation des couleurs…','Farben werden vorbereitet…','色を準備しています…','색을 준비하고 있어요…','Подготовка цветов…','جارٍ تجهيز الألوان…','रंग तैयार हो रहे हैं…','Menyiapkan warna…'],
  standard: ['Standard','标准','標準','Estándar','Padrão','Normal','Standard','標準','보통','Обычный','عادي','सामान्य','Standar'],
  easy: ['Easy','轻松','輕鬆','Fácil','Fácil','Facile','Leicht','かんたん','쉬움','Лёгкий','سهل','आसान','Mudah'],
  hard: ['Hard','挑战','挑戰','Difícil','Difícil','Difficile','Schwer','難しい','어려움','Сложный','صعب','कठिन','Sulit'],
  expert: ['Expert','高难','高難','Experto','Especialista','Expert','Experte','上級','전문가','Эксперт','خبير','विशेषज्ञ','Ahli'],
  replay: ['Replay','重玩','重玩','Repetición','Repetição','Rejouer','Wiederholung','再プレイ','다시 하기','Повтор','إعادة','फिर खेलें','Ulang'],
  completedCount: ['Completed: {n}','已通过 {n} 关','已通過 {n} 關','Completados: {n}','Concluídos: {n}','Terminés : {n}','Geschafft: {n}','クリア：{n}','완료: {n}','Пройдено: {n}','المكتملة: {n}','पूरे: {n}','Selesai: {n}'],
  totalLevels: ['1,000 levels','共 1000 关','共 1000 關','1.000 niveles','1.000 níveis','1 000 niveaux','1.000 Level','1,000レベル','1,000개 레벨','1 000 уровней','ألف مرحلة','1,000 स्तर','1.000 level'],
  continueLevel: ['Continue · {n}','继续第 {n} 关','繼續第 {n} 關','Continuar · {n}','Continuar · {n}','Continuer · {n}','Weiter · {n}','つづき · {n}','계속 · {n}','Продолжить · {n}','متابعة · {n}','जारी रखें · {n}','Lanjutkan · {n}'],
  replayNote: ['Revisit any completed level.','已通关的关卡，可以随时再挑战。','已通關的關卡，可以隨時再挑戰。','Repite cualquier nivel completado.','Rejogue qualquer nível concluído.','Rejouez les niveaux déjà terminés.','Geschaffte Level jederzeit wiederholen.','クリアしたレベルはいつでも遊べます。','완료한 레벨은 언제든 다시 할 수 있어요.','Пройденные уровни можно повторить.','يمكنك إعادة أي مرحلة مكتملة.','पूरा स्तर कभी भी फिर खेलें।','Mainkan ulang level yang sudah selesai.'],
  current: ['Current','当前','目前','Actual','Atual','Actuel','Aktuell','プレイ中','현재','Текущий','الحالي','वर्तमान','Saat ini'],
  completed: ['Completed','已通过','已通過','Completado','Concluído','Terminé','Geschafft','クリア済み','완료','Пройден','مكتمل','पूरा','Selesai'],
  locked: ['Locked','未解锁','未解鎖','Bloqueado','Bloqueado','Verrouillé','Gesperrt','未開放','잠김','Закрыт','مقفل','बंद','Terkunci'],
  levelState: ['Level {n}, {state}','第 {n} 关，{state}','第 {n} 關，{state}','Nivel {n}, {state}','Nível {n}, {state}','Niveau {n}, {state}','Level {n}, {state}','レベル{n}、{state}','레벨 {n}, {state}','Уровень {n}, {state}','المرحلة {n}، {state}','स्तर {n}, {state}','Level {n}, {state}'],
  harmony: ['Let the colors find harmony','让色彩，慢慢归位','讓色彩，慢慢歸位','Encuentra la armonía del color','Encontre a harmonia das cores','Les couleurs en harmonie','Farben finden ihre Harmonie','色をそっと揃えましょう','색을 천천히 정리해요','Пусть цвета найдут гармонию','دع الألوان تنسجم','रंगों को सुकून से सजाएँ','Biarkan warna menemukan harmoni'],
  pace: ['Enjoy every level at your own pace.','按自己的节奏，享受每一关。','按自己的節奏，享受每一關。','Disfruta cada nivel a tu ritmo.','Aproveite cada nível no seu ritmo.','Savourez chaque niveau à votre rythme.','Genieße jedes Level in deinem Tempo.','自分のペースで楽しみましょう。','나만의 속도로 즐겨 보세요.','Наслаждайтесь игрой в своём темпе.','استمتع بكل مرحلة على مهل.','हर स्तर अपनी गति से खेलें।','Nikmati setiap level dengan santai.'],
  effects: ['Completion effects','完成效果','完成效果','Efectos al completar','Efeitos de conclusão','Effets de réussite','Abschlusseffekte','完成エフェクト','완성 효과','Эффекты завершения','تأثيرات الإكمال','पूर्ण होने के प्रभाव','Efek penyelesaian'],
  symbols: ['Color symbols','辅助符号','輔助符號','Símbolos de color','Símbolos de cores','Symboles de couleur','Farbsymbole','色の記号','색상 기호','Символы цветов','رموز الألوان','रंगों के चिह्न','Simbol warna'],
  symbolsNote: ['Distinguish colors with shapes','用图案区分不同颜色','用圖案區分不同顏色','Distingue colores con formas','Diferencie cores por formas','Distinguer les couleurs par des formes','Farben anhand von Formen unterscheiden','形で色を見分ける','모양으로 색을 구분해요','Различайте цвета по фигурам','تمييز الألوان بالأشكال','आकार से रंग पहचानें','Bedakan warna dengan bentuk'],
  language: ['Language','语言','語言','Idioma','Idioma','Langue','Sprache','言語','언어','Язык','اللغة','भाषा','Bahasa'],
  system: ['Follow device','跟随系统','跟隨系統','Según el dispositivo','Seguir dispositivo','Suivre l’appareil','Gerätesprache','端末の言語','기기 언어','Язык устройства','لغة الجهاز','डिवाइस की भाषा','Ikuti perangkat'],
  languageNote: ['Changes apply immediately','选择后立即生效','選擇後立即生效','Los cambios se aplican al instante','Alterações imediatas','Changement immédiat','Änderung sofort wirksam','すぐに反映されます','즉시 적용돼요','Изменения применяются сразу','يُطبق الاختيار فوراً','बदलाव तुरंत लागू होंगे','Perubahan langsung diterapkan'],
  gold: ['Gold outline','金色边框','金色邊框','Borde dorado','Borda dourada','Contour doré','Goldrand','金の縁取り','금빛 테두리','Золотой контур','إطار ذهبي','सुनहरी किनारी','Bingkai emas'],
  cork: ['Cork','瓶塞','瓶塞','Corcho','Rolha','Bouchon','Korken','コルク','코르크','Пробка','سدادة','कॉर्क','Gabus'],
  halo: ['Halo','光晕','光暈','Halo','Halo','Halo','Lichtschein','光の輪','빛무리','Сияние','هالة','आभा','Halo'],
  effectsNote: ['Choose an effect to preview its animation.','点选一种，查看完成一瓶时的动画。','點選一種，查看完成一瓶時的動畫。','Elige un efecto para ver su animación.','Escolha um efeito para ver a animação.','Choisissez un effet pour voir son animation.','Wähle einen Effekt für die Animationsvorschau.','エフェクトを選んでアニメーションを見る。','효과를 선택해 애니메이션을 확인하세요.','Выберите эффект для просмотра анимации.','اختر تأثيراً لمشاهدة حركته.','प्रभाव चुनकर उसका एनीमेशन देखें।','Pilih efek untuk melihat animasinya.'],
  replayAnimation: ['Replay animation','重播完成动画','重播完成動畫','Repetir animación','Repetir animação','Revoir l’animation','Animation wiederholen','もう一度見る','애니메이션 다시 보기','Повторить анимацию','إعادة الحركة','एनीमेशन फिर देखें','Ulangi animasi'],
  effectsRule: ['Effects appear when one color fills a bottle.','装满同色液体，完成效果就会出现。','裝滿同色液體，完成效果就會出現。','El efecto aparece al llenar con un solo color.','O efeito aparece ao encher com uma cor.','L’effet apparaît avec une bouteille d’une seule couleur.','Der Effekt erscheint bei einer vollen einfarbigen Flasche.','同じ色で満たすとエフェクトが現れます。','한 가지 색으로 가득 채우면 효과가 나타나요.','Эффект появляется в полной одноцветной бутылке.','يظهر التأثير عند امتلاء الزجاجة بلون واحد.','एक रंग से बोतल भरने पर प्रभाव दिखेगा।','Efek muncul saat botol penuh dengan satu warna.'],
  tutorialTitle: ['Bring the colors together','来，把色彩归位！','來，把色彩歸位！','¡Ordena los colores!','Organize as cores!','Réunissez les couleurs !','Bring die Farben zusammen!','色を揃えましょう！','색을 모아 보세요!','Соберите цвета вместе!','اجمع الألوان معاً!','रंगों को सजाएँ!','Ayo susun warnanya!'],
  step1: ['Choose a bottle','选一个瓶子','選一個瓶子','Elige una botella','Escolha uma garrafa','Choisissez une bouteille','Wähle eine Flasche','瓶を選ぶ','병 선택하기','Выберите бутылку','اختر زجاجة','बोतल चुनें','Pilih botol'],
  step1Note: ['Tap a bottle with liquid.','点一下有水的瓶子。','點一下有水的瓶子。','Toca una botella con líquido.','Toque uma garrafa com líquido.','Touchez une bouteille contenant du liquide.','Tippe auf eine Flasche mit Flüssigkeit.','液体の入った瓶をタップ。','물이 든 병을 누르세요.','Нажмите на бутылку с жидкостью.','اضغط على زجاجة بها سائل.','भरी हुई बोतल छुएँ।','Ketuk botol berisi cairan.'],
  step2: ['Pour the color','把颜色倒过去','把顏色倒過去','Vierte el color','Despeje a cor','Versez la couleur','Gieße die Farbe um','色を移す','색 옮기기','Перелейте цвет','اسكب اللون','रंग उँडेलें','Tuangkan warna'],
  step3: ['One color, level complete!','同色装满，过关！','同色裝滿，過關！','¡Un solo color, nivel completado!','Uma cor, nível concluído!','Une couleur, niveau réussi !','Eine Farbe, Level geschafft!','同じ色で満たしてクリア！','같은 색을 채우면 성공!','Один цвет — уровень пройден!','لون واحد، مرحلة مكتملة!','एक रंग, स्तर पूरा!','Satu warna, level selesai!'],
  tutorialTip: ['Undo, hints and restarts are always free.','撤销、提示、重来，陪你轻松闯关。','復原、提示、重來，陪你輕鬆闖關。','Deshacer, pistas y reinicios siempre gratis.','Desfazer, dicas e reinícios sempre grátis.','Annulations, indices et reprises gratuits.','Zurück, Tipps und Neustarts sind kostenlos.','戻す・ヒント・やり直すはいつでも無料。','되돌리기, 힌트, 다시 시작은 언제나 무료예요.','Отмена, подсказки и повторы всегда бесплатны.','التراجع والتلميحات والإعادة مجانية دائماً.','पूर्ववत, संकेत और पुनः शुरुआत हमेशा मुफ्त हैं।','Urungkan, petunjuk, dan ulangi selalu gratis.'],
  start: ['Start playing','开始游戏','開始遊戲','Empezar','Começar','Jouer','Spielen','はじめる','시작하기','Начать игру','ابدأ اللعب','खेलें','Mulai bermain'],
  skip: ['I know how to play','我会玩，直接开始','我會玩，直接開始','Ya sé jugar','Já sei jogar','Je sais déjà jouer','Ich kenne das Spiel','遊び方は知っています','방법을 알고 있어요','Я знаю, как играть','أعرف كيف ألعب','मुझे खेलना आता है','Saya sudah tahu caranya'],
  bottle: ['Bottle {n}, {colors}','{n} 号瓶，{colors}','{n} 號瓶，{colors}','Botella {n}, {colors}','Garrafa {n}, {colors}','Bouteille {n}, {colors}','Flasche {n}, {colors}','瓶{n}、{colors}','{n}번 병, {colors}','Бутылка {n}, {colors}','الزجاجة {n}، {colors}','बोतल {n}, {colors}','Botol {n}, {colors}'],
  empty: ['Empty','空瓶','空瓶','Vacía','Vazia','Vide','Leer','空','빈 병','Пустая','فارغة','खाली','Kosong'],
  jade: ['Teal','青绿色','青綠色','Verde azulado','Verde-azulado','Turquoise','Türkis','青緑','청록','Бирюзовый','فيروزي','नीलहरित','Toska'],
  coral: ['Coral','珊瑚红','珊瑚紅','Coral','Coral','Corail','Koralle','コーラル','산호색','Коралловый','مرجاني','मूंगा','Koral'],
  amber: ['Amber','琥珀黄','琥珀黃','Ámbar','Âmbar','Ambre','Bernstein','琥珀','호박색','Янтарный','كهرماني','अंबर','Amber'],
  azure: ['Blue','天蓝色','天藍色','Azul','Azul','Bleu','Blau','青','파랑','Голубой','أزرق','नीला','Biru'],
  violet: ['Violet','紫罗兰','紫羅蘭','Violeta','Violeta','Violet','Violett','紫','보라','Фиолетовый','بنفسجي','बैंगनी','Ungu'],
  rose: ['Pink','玫瑰粉','玫瑰粉','Rosa','Rosa','Rose','Rosa','ピンク','분홍','Розовый','وردي','गुलाबी','Merah muda'],
  tangerine: ['Orange','橙色','橙色','Naranja','Laranja','Orange','Orange','オレンジ','주황','Оранжевый','برتقالي','नारंगी','Jingga'],
  lime: ['Green','草绿色','草綠色','Verde','Verde','Vert','Grün','緑','초록','Зелёный','أخضر','हरा','Hijau'],
  indigo: ['Indigo','靛蓝色','靛藍色','Índigo','Índigo','Indigo','Indigo','藍','남색','Индиго','نيلي','जामुनी','Nila'],
  cocoa: ['Brown','可可棕','可可棕','Marrón','Marrom','Brun','Braun','茶色','갈색','Коричневый','بني','भूरा','Cokelat'],
  silver: ['Silver','银灰色','銀灰色','Plateado','Prateado','Argent','Silber','銀','은색','Серебристый','فضي','चाँदी','Perak'],
  localProgress: ['Local progress','本地进度','本機進度','Progreso local','Progresso local','Progression locale','Lokaler Fortschritt','端末の進行状況','기기 진행 상황','Локальный прогресс','التقدم المحلي','स्थानीय प्रगति','Progres lokal'],
  saved: ['Saved on this device','已保存在本机','已儲存在本機','Guardado en este dispositivo','Salvo neste dispositivo','Enregistré sur cet appareil','Auf diesem Gerät gespeichert','この端末に保存済み','기기에 저장됨','Сохранено на устройстве','محفوظ على هذا الجهاز','इस डिवाइस पर सहेजा गया','Tersimpan di perangkat ini'],
  saveFailed: ['Save failed; the next action will retry','保存失败，下次操作重试','儲存失敗，下次操作重試','Error al guardar; se reintentará','Falha ao salvar; tentaremos novamente','Échec de sauvegarde ; nouvel essai au prochain coup','Speichern fehlgeschlagen; nächster Zug versucht es erneut','保存できませんでした。次の操作で再試行します','저장 실패. 다음 동작에서 다시 시도해요','Ошибка сохранения; повтор при следующем ходе','تعذر الحفظ؛ سنحاول مع الخطوة التالية','सहेजना विफल; अगली चाल पर फिर प्रयास होगा','Gagal menyimpan; tindakan berikutnya akan mencoba lagi'],
  saveTooLong: ['Progress could not be saved','本次进度未保存','本次進度未儲存','No se pudo guardar el progreso','Não foi possível salvar o progresso','Progression non enregistrée','Fortschritt konnte nicht gespeichert werden','進行状況を保存できませんでした','진행 상황을 저장하지 못했어요','Прогресс не сохранён','تعذر حفظ التقدم','प्रगति सहेजी नहीं गई','Progres tidak dapat disimpan'],
  restoreFailed: ['Progress could not be restored. A fresh game is ready.','保存记录无法恢复，已回到初次体验。','儲存紀錄無法恢復，已回到初次體驗。','No se pudo restaurar el progreso. Juego nuevo listo.','Não foi possível restaurar. Um novo jogo está pronto.','Restauration impossible. Une nouvelle partie est prête.','Fortschritt nicht wiederherstellbar. Neues Spiel bereit.','保存を復元できません。新しいゲームを始めます。','기록을 복원하지 못했어요. 새 게임을 준비했어요.','Не удалось восстановить прогресс. Готова новая игра.','تعذر استعادة التقدم. لعبة جديدة جاهزة.','प्रगति बहाल नहीं हुई। नया खेल तैयार है।','Progres gagal dipulihkan. Permainan baru siap.'],
  readFailed: ['Progress is unavailable. The next action will retry saving.','暂时读不到本地进度，新的操作会重试保存。','暫時讀不到本機進度，新的操作會重試儲存。','Progreso no disponible. Se reintentará guardar.','Progresso indisponível. Tentaremos salvar novamente.','Progression indisponible. Sauvegarde réessayée au prochain coup.','Fortschritt nicht verfügbar. Nächster Zug versucht erneut zu speichern.','進行状況を読めません。次の操作で保存を再試行します。','기록을 읽지 못했어요. 다음 동작에서 저장을 다시 시도해요.','Прогресс недоступен. Следующий ход повторит сохранение.','التقدم غير متاح. سنعيد محاولة الحفظ في الخطوة التالية.','प्रगति उपलब्ध नहीं। अगली चाल पर सहेजने का प्रयास होगा।','Progres tidak tersedia. Tindakan berikutnya mencoba menyimpan lagi.'],
  upgraded: ['1,000 levels are ready. Start from level 1.','已升级为千关主线，从第一关开始解锁。','已升級為千關主線，從第一關開始解鎖。','1.000 niveles listos. Empieza en el nivel 1.','1.000 níveis prontos. Comece no nível 1.','1 000 niveaux prêts. Commencez au niveau 1.','1.000 Level bereit. Beginne mit Level 1.','1,000レベルを用意しました。レベル1からどうぞ。','1,000개 레벨 준비 완료. 1레벨부터 시작해요.','Готовы 1 000 уровней. Начните с первого.','ألف مرحلة جاهزة. ابدأ من المرحلة الأولى.','1,000 स्तर तैयार हैं। स्तर 1 से शुरू करें।','1.000 level siap. Mulai dari level 1.'],
} as const satisfies Record<string, Translations>;
export type MessageKey = keyof typeof MESSAGES;
export function parsePreference(value: unknown): LanguagePreference {
  return value === 'system' || LANGUAGES.some(language => language.id === value) ? value as LanguagePreference : 'system';
}
export function resolveLanguage(locales: readonly string[]): Language {
  for (const tag of locales) {
    const parts = tag.replaceAll('_', '-').toLowerCase().split('-');
    if (parts[0] === 'zh') return parts.includes('hant') || (!parts.includes('hans') && parts.some(part => ['tw', 'hk', 'mo'].includes(part))) ? 'zh-Hant' : 'zh-Hans';
    const language = LANGUAGES.find(language => language.id === parts[0]);
    if (language) return language.id;
  }
  return 'en';
}
export function translate(language: Language, key: MessageKey, params: Record<string, string | number> = {}): string {
  const column = LANGUAGES.findIndex(item => item.id === language);
  return MESSAGES[key][column].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder));
}
