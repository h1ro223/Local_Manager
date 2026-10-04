/* =========================================================
   Starlit English — script.js
   made by hiro/ヒロ   https://github.com/h1ro223
   ========================================================= */
'use strict';

/* ===================== 1. ユーティリティ ===================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hasLatin = (s) => /[A-Za-z]/.test(s);

/* ===================== 2. 学習データ ===================== */
/* 問題タイプ
   ch : 4択      p=問題文 a=正解 w=誤答3つ
   ar : 並び替え  p=日本語 a=英文        au=true なら音声出題
   sp : スペル    p=日本語 a=英単語       au=true なら音声出題
   ls : リスニング p=読み上げ英文 a=正しい訳 w=誤答3つ                       */
const ch = (p, a, w) => ({ t: 'ch', p, a, w });
const ar = (p, a) => ({ t: 'ar', p, a });
const sp = (p, a) => ({ t: 'sp', p, a });
const ls = (p, a, w) => ({ t: 'ls', p, a, w });
const arA = (a, p) => ({ t: 'ar', p, a, au: true });
const spA = (a, p) => ({ t: 'sp', p, a, au: true });

const UNITS = [
{
  id: 'g', name: '基礎文法', icon: '🧩', color: '#7b6cff',
  desc: 'be動詞から代名詞まで。英文の骨組みを組み立てる。',
  lessons: [
    { name: 'be動詞', icon: '🪐', qs: [
      ch('「私は先生です。」を英語にすると?', 'I am a teacher.', ['I is a teacher.', 'I are a teacher.', 'I be a teacher.']),
      ch('「彼女は親切です。」を英語にすると?', 'She is kind.', ['She are kind.', 'She am kind.', 'She be kind.']),
      ar('私たちは友達です。', 'We are friends.'),
      ch('空欄に入るのは? — They ___ students.', 'are', ['is', 'am', 'be']),
      sp('生徒・学生', 'student'),
      ls('He is my brother.', '彼は私の兄です。', ['彼は私の父です。', '彼女は私の姉です。', '彼は私の友達です。']),
      ar('あれは私のかばんではありません。', 'That is not my bag.')
    ]},
    { name: '一般動詞', icon: '⚙️', qs: [
      ch('「私は毎日サッカーをします。」', 'I play soccer every day.', ['I plays soccer every day.', 'I am play soccer every day.', 'I playing soccer every day.']),
      ch('空欄に入るのは? — He ___ TV every night.', 'watches', ['watch', 'watching', 'to watch']),
      ar('私は毎朝コーヒーを飲みます。', 'I drink coffee every morning.'),
      sp('走る', 'run'),
      ls('She goes to school by bus.', '彼女はバスで学校へ行きます。', ['彼女は歩いて学校へ行きます。', '彼女は電車で会社へ行きます。', '彼女はバスで家に帰ります。']),
      ch('「彼らは英語を勉強します。」', 'They study English.', ['They studies English.', 'They is study English.', 'They studying English.']),
      ar('私の父は車を運転します。', 'My father drives a car.')
    ]},
    { name: '疑問文と否定文', icon: '❓', qs: [
      ch('「あなたは犬が好きですか?」', 'Do you like dogs?', ['Are you like dogs?', 'Do you likes dogs?', 'You do like dogs?']),
      ch('「彼はピアノを弾きません。」', 'He does not play the piano.', ['He do not play the piano.', 'He not plays the piano.', 'He is not play the piano.']),
      ar('彼女は忙しいですか?', 'Is she busy?'),
      ch('Do you have a pen? への正しい答え方は?', 'Yes, I do.', ['Yes, I am.', 'Yes, I does.', 'Yes, you do.']),
      sp('質問・疑問', 'question'),
      ls('I do not have any money.', '私はお金を持っていません。', ['私はお金をたくさん持っています。', '私は財布をなくしました。', '私はお金を借りたいです。']),
      ar('あなたはどこに住んでいますか?', 'Where do you live?')
    ]},
    { name: '複数形と冠詞', icon: '🔢', qs: [
      ch('「箱 (box)」の複数形は?', 'boxes', ['boxs', 'boxen', 'boxies']),
      ch('空欄に入るのは? — I have ___ apple.', 'an', ['a', 'the', 'some']),
      ar('机の上に本が3冊あります。', 'There are three books on the desk.'),
      sp('子どもたち (child の複数形)', 'children'),
      ch('「彼は水がほしい。」', 'He wants some water.', ['He wants a water.', 'He want some waters.', 'He wants many water.']),
      ls('I bought two tickets.', '私はチケットを2枚買いました。', ['私はチケットを2枚売りました。', '私は切符を2つ探しています。', '私は2つの店に行きました。']),
      ar('その市には大きな公園があります。', 'The city has a big park.')
    ]},
    { name: '代名詞', icon: '👥', qs: [
      ch('「これは私のものです。」', 'This is mine.', ['This is my.', 'This is me.', 'This is I.']),
      ch('空欄に入るのは? — I know ___ very well.', 'him', ['he', 'his', 'he is']),
      ar('彼らは私たちを手伝ってくれました。', 'They helped us.'),
      sp('彼女のもの', 'hers'),
      ch('「その本は彼女のものです。」', 'The book is hers.', ['The book is her.', 'The book is she.', 'The book is her own it.']),
      ls('Can you tell me about yourself?', 'あなた自身について教えてくれますか?', ['あなたの家族を紹介してください。', '私について何か知っていますか?', '自分でやってみてくれますか?']),
      ar('私は自分でそれをやりました。', 'I did it myself.')
    ]}
  ]
},
{
  id: 'w', name: '中学英単語', icon: '📚', color: '#46d9f5',
  desc: '教科書レベルの必須単語を、意味と綴りの両方で固める。',
  lessons: [
    { name: '身のまわりのもの', icon: '🎒', qs: [
      ch('「机」を英語で言うと?', 'desk', ['shelf', 'floor', 'drawer']),
      sp('かばん', 'bag'),
      ch('「窓」を英語で言うと?', 'window', ['wind', 'wall', 'roof']),
      ls('Please close the door.', 'ドアを閉めてください。', ['窓を開けてください。', 'ドアを開けてください。', 'カーテンを閉めてください。']),
      sp('掛け時計', 'clock'),
      ar('私はかばんの中に鍵を入れました。', 'I put the key in my bag.'),
      ch('umbrella の意味は?', '傘', ['靴', '帽子', '手袋'])
    ]},
    { name: '動作の動詞', icon: '🏃', qs: [
      ch('「買う」を英語で言うと?', 'buy', ['sell', 'pay', 'bring']),
      sp('話す', 'speak'),
      ch('borrow の意味は?', '借りる', ['貸す', '売る', '返す']),
      ar('私は毎晩本を読みます。', 'I read a book every night.'),
      ls('Let us meet at the station.', '駅で会いましょう。', ['駅まで歩きましょう。', '公園で会いましょう。', '駅で待っていました。']),
      sp('作る', 'make'),
      ch('「彼は速く走ることができる。」', 'He can run fast.', ['He can runs fast.', 'He cans run fast.', 'He is can run fast.'])
    ]},
    { name: '形容詞', icon: '🎨', qs: [
      ch('difficult の意味は?', '難しい', ['簡単な', '退屈な', '危険な']),
      sp('美しい', 'beautiful'),
      ch('cold と反対の意味の語は?', 'hot', ['cool', 'wet', 'dark']),
      ar('この問題はとても難しいです。', 'This question is very difficult.'),
      ls('The movie was really interesting.', 'その映画は本当に面白かった。', ['その映画はとても長かった。', 'その本は本当に面白かった。', 'その映画は退屈だった。']),
      sp('危険な', 'dangerous'),
      ch('tired の意味は?', '疲れた', ['退屈な', 'うれしい', '眠い'])
    ]},
    { name: '学校と生活', icon: '🏫', qs: [
      ch('「宿題」を英語で言うと?', 'homework', ['housework', 'classwork', 'homeroom']),
      sp('授業・クラス', 'class'),
      ch('library の意味は?', '図書館', ['本屋', '体育館', '美術館']),
      ar('私は放課後に部活へ行きます。', 'I go to my club after school.'),
      ls('I forgot my textbook today.', '今日は教科書を忘れました。', ['今日は宿題を忘れました。', '昨日は教科書をなくしました。', '今日は教科書を買いました。']),
      sp('試験', 'exam'),
      ch('「制服」を英語で言うと?', 'uniform', ['costume', 'suit', 'jacket'])
    ]},
    { name: '自然と季節', icon: '🍂', qs: [
      ch('autumn の意味は?', '秋', ['春', '夏', '冬']),
      sp('雪', 'snow'),
      ch('「曇っている」を英語で言うと?', 'cloudy', ['rainy', 'windy', 'sunny']),
      ar('日本の夏はとても暑いです。', 'Summer in Japan is very hot.'),
      ls('It will rain tomorrow afternoon.', '明日の午後は雨が降るでしょう。', ['昨日の午後は雨でした。', '明日の朝は晴れるでしょう。', '今日の午後は雪になるでしょう。']),
      sp('川', 'river'),
      ch('leaf の複数形は?', 'leaves', ['leafs', 'leafes', 'leafves'])
    ]}
  ]
},
{
  id: 'c', name: '日常会話', icon: '💬', color: '#2fe3a6',
  desc: 'あいさつから買い物・道案内まで。そのまま使えるフレーズ。',
  lessons: [
    { name: 'あいさつ', icon: '👋', qs: [
      ch('「はじめまして。」', 'Nice to meet you.', ['Nice to meet me.', 'Nice meet you.', 'Good to see you again.']),
      ls('How have you been?', '最近どうしていましたか?', ['はじめまして。', 'どこへ行きますか?', '体調は良くなりましたか?']),
      ar('久しぶりですね。', 'It has been a long time.'),
      ch('How is it going? への自然な返事は?', 'Pretty good, thanks.', ['Yes, I do.', 'You are welcome.', 'It is going there.']),
      sp('さようなら', 'goodbye'),
      ar('また近いうちに会いましょう。', 'Let us meet again soon.'),
      ch('「お元気ですか?」', 'How are you doing?', ['How do you do it?', 'What are you doing?', 'How about you doing?'])
    ]},
    { name: '買い物', icon: '🛍️', qs: [
      ch('「これはいくらですか?」', 'How much is this?', ['How many is this?', 'How much this is?', 'What much is this?']),
      ls('Can I try this on?', 'これを試着してもいいですか?', ['これを返品できますか?', 'これをもらえますか?', 'これを見てもいいですか?']),
      ar('もっと大きいサイズはありますか?', 'Do you have a bigger size?'),
      sp('レシート', 'receipt'),
      ch('I am just looking. の意味は?', '見ているだけです', ['探しています', 'これをください', '安くしてください']),
      ar('カードで払えますか?', 'Can I pay by card?'),
      ch('店員の May I help you? を断るなら?', 'No thank you, I am fine.', ['Yes, I am fine.', 'No, you may not.', 'I help you too.'])
    ]},
    { name: 'レストラン', icon: '🍽️', qs: [
      ch('「注文をお願いします。」', 'I would like to order, please.', ['I want order, please.', 'I like order, please.', 'I am order, please.']),
      ls('Would you like something to drink?', 'お飲み物はいかがですか?', ['何か食べたいですか?', 'デザートはいかがですか?', '飲み物はどこにありますか?']),
      ar('お会計をお願いします。', 'Could I have the check, please?'),
      sp('メニュー', 'menu'),
      ch('For here or to go? の意味は?', '店内で食べますか、持ち帰りますか', ['予約はありますか', '何名様ですか', '支払いは現金ですか']),
      ar('2名で席を予約したいのですが。', 'I would like to book a table for two.'),
      ch('「これはとてもおいしいです。」', 'This tastes really good.', ['This taste really good.', 'This is taste good.', 'This tasty really good.'])
    ]},
    { name: '道案内', icon: '🧭', qs: [
      ch('「駅はどこですか?」', 'Where is the station?', ['Where the station is?', 'Where does the station?', 'What is the station?']),
      ls('Go straight and turn left at the corner.', 'まっすぐ行って角を左に曲がってください。', ['まっすぐ行って角を右に曲がってください。', '2つ目の角を左に曲がってください。', 'まっすぐ行って橋を渡ってください。']),
      ar('ここから歩いて10分です。', 'It is ten minutes on foot from here.'),
      sp('地図', 'map'),
      ch('It is across from the bank. の意味は?', '銀行の向かいにあります', ['銀行の隣にあります', '銀行の中にあります', '銀行の裏にあります']),
      ar('この電車は空港に行きますか?', 'Does this train go to the airport?'),
      ch('「道に迷いました。」', 'I am lost.', ['I am lose.', 'I lost me.', 'I am missing the road.'])
    ]},
    { name: '電話と約束', icon: '📞', qs: [
      ch('電話で「田中さんをお願いします。」', 'May I speak to Mr. Tanaka?', ['May I speak Mr. Tanaka?', 'Can you Mr. Tanaka?', 'I want Mr. Tanaka now.']),
      ls('Sorry, he is not available right now.', 'すみません、彼は今手が空いていません。', ['すみません、彼は今日は休みです。', 'すみません、番号が違います。', 'すみません、彼はもうすぐ来ます。']),
      ar('金曜日の午後は空いていますか?', 'Are you free on Friday afternoon?'),
      sp('約束・予約', 'appointment'),
      ch('Can I call you back later? の意味は?', 'あとでかけ直してもいいですか', ['あとで電話をください', '今すぐ話せますか', '伝言をお願いします']),
      ar('少々お待ちください。', 'Please hold on a moment.'),
      ch('「急用ができました。」', 'Something has come up.', ['Something is come up.', 'I have a bad convenience.', 'My time became bad.'])
    ]}
  ]
},
{
  id: 't', name: 'TOEIC文法', icon: '📈', color: '#ffc74d',
  desc: 'Part5で狙われる時制・比較・前置詞・関係詞を集中攻略。',
  lessons: [
    { name: '時制', icon: '⏳', qs: [
      ch('He ___ the report before the meeting started.', 'had finished', ['has finished', 'is finishing', 'finish']),
      ch('I ___ here for ten years.', 'have worked', ['work', 'am working', 'was working']),
      ar('私は先週その資料を送りました。', 'I sent the documents last week.'),
      ls('The meeting will start at three.', '会議は3時に始まります。', ['会議は3時に終わります。', '会議は3時間続きます。', '会議は3日後に始まります。']),
      ch('By next month, she ___ the project.', 'will have finished', ['will finish', 'has finished', 'finished']),
      sp('締め切り', 'deadline'),
      ar('彼は今、報告書を書いているところです。', 'He is writing the report now.')
    ]},
    { name: '比較', icon: '⚖️', qs: [
      ch('This plan is ___ than that one.', 'better', ['good', 'best', 'more good']),
      ch('「東京は日本で最も大きな都市です。」', 'Tokyo is the largest city in Japan.', ['Tokyo is the larger city in Japan.', 'Tokyo is largest city in Japan.', 'Tokyo is more large city in Japan.']),
      ar('この機械はあの機械より高価です。', 'This machine is more expensive than that one.'),
      ls('Sales were higher than last year.', '売上は昨年より高かった。', ['売上は昨年より低かった。', '売上は昨年と同じだった。', '価格は昨年より高かった。']),
      ch('as ___ as possible の空欄に入るのは?', 'soon', ['sooner', 'soonest', 'more soon']),
      sp('売上', 'sales'),
      ar('できるだけ早く返信をください。', 'Please reply as soon as possible.')
    ]},
    { name: '前置詞', icon: '📍', qs: [
      ch('The meeting is ___ Monday.', 'on', ['in', 'at', 'to']),
      ch('The store opens ___ nine in the morning.', 'at', ['on', 'for', 'to']),
      ar('彼女は5年間この会社で働いています。', 'She has worked for this company for five years.'),
      ls('Please submit the form by Friday.', '金曜日までに書類を提出してください。', ['金曜日に書類を受け取ってください。', '金曜日から書類を配ります。', '金曜日までに会議を終えてください。']),
      ch('in charge of の意味は?', '〜を担当している', ['〜を請求する', '〜を無料にする', '〜を交換する']),
      sp('会議', 'meeting'),
      ar('彼は出張で大阪にいます。', 'He is in Osaka on a business trip.')
    ]},
    { name: '受動態と関係詞', icon: '🔗', qs: [
      ch('The report ___ by Mr. Sato.', 'was written', ['wrote', 'was wrote', 'is writing']),
      ch('The man ___ is talking is our manager.', 'who', ['which', 'whose', 'whom']),
      ar('この製品は日本で作られています。', 'This product is made in Japan.'),
      ls('The order was canceled yesterday.', 'その注文は昨日キャンセルされました。', ['その注文は昨日届きました。', 'その注文は明日発送されます。', 'その会議は昨日中止されました。']),
      ch('I need a person ___ can speak Chinese.', 'who', ['which', 'what', 'whose']),
      sp('顧客', 'customer'),
      ar('私が昨日会った女性は医者です。', 'The woman I met yesterday is a doctor.')
    ]},
    { name: 'ビジネス語彙', icon: '💼', qs: [
      ch('invoice の意味は?', '請求書', ['領収書', '見積書', '契約書']),
      sp('契約', 'contract'),
      ch('schedule a meeting の意味は?', '会議の予定を組む', ['会議を中止する', '会議に遅れる', '会議を欠席する']),
      ar('添付ファイルをご確認ください。', 'Please check the attached file.'),
      ls('We need to reschedule the appointment.', '予定を組み直す必要があります。', ['予約を取り消す必要があります。', '予定どおり進める必要があります。', '会場を変更する必要があります。']),
      sp('部署', 'department'),
      ch('Attached please find the file. に近い意味は?', 'ファイルを添付しました', ['ファイルを探しています', 'ファイルが見つかりません', 'ファイルを送ってください'])
    ]}
  ]
},
{
  id: 'l', name: 'リスニング特訓', icon: '🎧', color: '#ff5f79',
  desc: '音だけを頼りに、聞き取り・書き取り・並べ替えで耳を鍛える。',
  lessons: [
    { name: '短い文を聞く', icon: '🔊', qs: [
      ls('I usually get up at six thirty.', '私はたいてい6時半に起きます。', ['私はたいてい6時に寝ます。', '私はときどき7時半に起きます。', '私は6時半に家を出ます。']),
      spA('breakfast', '朝食'),
      arA('I have a question for you.', 'あなたに質問があります。'),
      ls('She lives near the park.', '彼女は公園の近くに住んでいます。', ['彼女は公園で働いています。', '彼女は駅の近くに住んでいます。', '彼女は公園まで歩きます。']),
      spA('weather', '天気'),
      arA('We are going to the beach.', '私たちは海へ行きます。'),
      ls('My brother works at a hospital.', '私の兄は病院で働いています。', ['私の姉は病院で働いています。', '私の兄は病院にいます。', '私の兄は銀行で働いています。'])
    ]},
    { name: '数字と時間', icon: '🕒', qs: [
      ls('The train leaves at seven fifteen.', '電車は7時15分に出発します。', ['電車は7時50分に出発します。', '電車は7時15分に到着します。', '電車は6時15分に出発します。']),
      spA('thirteen', '13'),
      arA('It costs about thirty dollars.', 'それは約30ドルです。'),
      ls('There are twenty five students.', '25人の生徒がいます。', ['15人の生徒がいます。', '25人の先生がいます。', '20人の生徒が来ました。']),
      spA('Wednesday', '水曜日'),
      arA('The store opens at nine in the morning.', '店は午前9時に開きます。'),
      ls('I will be back in fifteen minutes.', '15分で戻ります。', ['50分で戻ります。', '15分後に出発します。', '15時に戻ります。'])
    ]},
    { name: '場所を聞き取る', icon: '🗺️', qs: [
      ls('The bank is next to the post office.', '銀行は郵便局の隣にあります。', ['銀行は郵便局の向かいにあります。', '郵便局は銀行の中にあります。', '銀行は駅の隣にあります。']),
      spA('hospital', '病院'),
      arA('Take the second street on your right.', '2つ目の道を右に行ってください。'),
      ls('It is just around the corner.', 'それはすぐ角を曲がったところです。', ['それは道の突き当たりです。', 'それは角の手前にあります。', 'それはこの建物の中です。']),
      spA('airport', '空港'),
      arA('The museum is closed on Mondays.', 'その博物館は月曜日は閉まっています。'),
      ls('You can take the bus from here.', 'ここからバスに乗れます。', ['ここまでバスで来られます。', 'ここでバスを降りてください。', 'ここから電車に乗れます。'])
    ]},
    { name: '会話の応答', icon: '🗣️', qs: [
      ls('Would you mind opening the window?', '窓を開けてもらえませんか?', ['窓を閉めてもらえませんか?', '窓を開けたのは誰ですか?', 'ドアを開けてもいいですか?']),
      ch('Could you give me a hand? への自然な返事は?', 'Sure, no problem.', ['Yes, I have a hand.', 'No, I give you.', 'I am a hand.']),
      arA('I am afraid I cannot make it.', '残念ながら行けません。'),
      ls('How about meeting at noon?', '正午に会うのはどうですか?', ['正午に昼食はどうですか?', '夜に会うのはどうですか?', '正午に着く予定です。']),
      spA('probably', 'おそらく'),
      arA('That sounds like a great idea.', 'それは素晴らしい考えですね。'),
      ls('Let me check my schedule first.', 'まず予定を確認させてください。', ['まず彼に確認してください。', '私の予定を教えてください。', 'まず会議を始めましょう。'])
    ]},
    { name: 'アナウンス', icon: '📢', qs: [
      ls('The meeting has been moved to Thursday.', '会議は木曜日に変更されました。', ['会議は火曜日に変更されました。', '会議は木曜日に終わりました。', '会議は木曜日に決まりそうです。']),
      spA('announcement', 'お知らせ'),
      arA('Please turn off your mobile phones.', '携帯電話の電源をお切りください。'),
      ls('Flight 208 will depart from gate five.', '208便は5番ゲートから出発します。', ['208便は5番ゲートに到着します。', '280便は5番ゲートから出発します。', '208便は15番ゲートから出発します。']),
      spA('passenger', '乗客'),
      arA('We apologize for the delay.', '遅延をお詫びいたします。'),
      ls('The office will be closed next week.', '来週オフィスは閉まります。', ['今週オフィスは閉まります。', '来週オフィスが開きます。', '来週から工事が始まります。'])
    ]}
  ]
}];

const BADGES = [
  { id: 'first',  ico: '🌱', name: 'はじめの一歩',   test: s => s.totalLessons >= 1 },
  { id: 'l10',    ico: '📗', name: '10レッスン達成', test: s => s.totalLessons >= 10 },
  { id: 'l25',    ico: '🏅', name: '全レッスン制覇', test: s => s.doneCount >= 25 },
  { id: 'xp500',  ico: '✦',  name: '500 XP',        test: s => s.xp >= 500 },
  { id: 'xp2000', ico: '💎', name: '2000 XP',       test: s => s.xp >= 2000 },
  { id: 'st3',    ico: '🔥', name: '3日連続',        test: s => s.bestStreak >= 3 },
  { id: 'st7',    ico: '☄️', name: '7日連続',        test: s => s.bestStreak >= 7 },
  { id: 'perf5',  ico: '👑', name: 'ノーミス5回',     test: s => s.perfects >= 5 }
];

/* ===================== 3. セーブデータ ===================== */
const SAVE_KEY = 'starlit_english_v1';
const HEART_MAX = 5;
const HEART_MS = 10 * 60 * 1000;

const defaultState = () => ({
  v: 1,
  xp: 0,
  hearts: HEART_MAX,
  heartAt: Date.now(),
  streak: 0,
  bestStreak: 0,
  lastDay: '',
  totalLessons: 0,
  perfects: 0,
  correct: 0,
  wrong: 0,
  daily: {},                 // "2026-08-17": 獲得XP
  done: {},                  // "g0": {stars, best}
  sound: true,
  autoSpeak: true,
  rate: 0.95,
  goal: 50
});

let S = defaultState();
let memoryOnly = false;

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) S = Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { memoryOnly = true; }
  regenHearts();
  checkStreak();
}
function save() {
  if (memoryOnly) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }
  catch (e) { memoryOnly = true; }
}

function regenHearts() {
  if (S.hearts >= HEART_MAX) { S.heartAt = Date.now(); return; }
  const gained = Math.floor((Date.now() - S.heartAt) / HEART_MS);
  if (gained > 0) {
    S.hearts = Math.min(HEART_MAX, S.hearts + gained);
    S.heartAt = S.hearts >= HEART_MAX ? Date.now() : S.heartAt + gained * HEART_MS;
  }
}
function heartLeftMs() {
  if (S.hearts >= HEART_MAX) return 0;
  return Math.max(0, HEART_MS - (Date.now() - S.heartAt));
}
function checkStreak() {
  const t = todayKey();
  if (!S.lastDay) return;
  const d = dayDiff(S.lastDay, t);
  if (d >= 2) S.streak = 0;   // 1日空いたら途切れる
}
function markToday(xp) {
  const t = todayKey();
  if (S.lastDay !== t) {
    const d = S.lastDay ? dayDiff(S.lastDay, t) : 99;
    S.streak = (d === 1) ? S.streak + 1 : 1;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    S.lastDay = t;
  }
  S.daily[t] = (S.daily[t] || 0) + xp;
}

/* レベル計算：必要XPは 100, 250, 450, 700 … と増える */
function levelInfo(xp) {
  let lv = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; lv++; need = 100 + (lv - 1) * 50; }
  return { lv, cur: xp - acc, need, ratio: (xp - acc) / need };
}
const lessonKey = (u, i) => UNITS[u].id + i;
const isDone = (u, i) => !!S.done[lessonKey(u, i)];
const unitDone = (u) => UNITS[u].lessons.reduce((n, _, i) => n + (isDone(u, i) ? 1 : 0), 0);
const unitOpen = (u) => u === 0 || unitDone(u - 1) >= 3;
const lessonOpen = (u, i) => unitOpen(u) && (i === 0 || isDone(u, i - 1));
const doneCount = () => UNITS.reduce((n, _, u) => n + unitDone(u), 0);

/* ===================== 4. サウンドと読み上げ ===================== */
let AC = null;
function ac() {
  if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type = 'sine', vol = 0.18, delay = 0) {
  if (!S.sound) return;
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  tap:   () => tone(520, 0.06, 'triangle', 0.10),
  ok:    () => { tone(784, 0.13, 'sine', 0.16); tone(1046, 0.16, 'sine', 0.14, 0.09); tone(1318, 0.24, 'sine', 0.11, 0.18); },
  ng:    () => { tone(220, 0.18, 'sawtooth', 0.11); tone(165, 0.28, 'sawtooth', 0.09, 0.10); },
  clear: () => [0, .12, .24, .40].forEach((d, i) => tone([523, 659, 784, 1046][i], 0.42, 'sine', 0.15, d)),
  level: () => [0, .10, .20, .30, .44].forEach((d, i) => tone([659, 784, 988, 1175, 1568][i], 0.5, 'triangle', 0.14, d)),
  fail:  () => [0, .14, .30].forEach((d, i) => tone([392, 311, 233][i], 0.4, 'sine', 0.14, d))
};

let voices = [];
function loadVoices() { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
function pickVoice() {
  if (!voices.length) loadVoices();
  return voices.find(v => /en[-_]US/i.test(v.lang) && /female|samantha|zira|google/i.test(v.name))
      || voices.find(v => /en[-_]US/i.test(v.lang))
      || voices.find(v => /^en/i.test(v.lang)) || null;
}
function speak(text, rate) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate != null ? rate : S.rate;
    const v = pickVoice(); if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch (e) { /* 読み上げ非対応の環境では黙って無視 */ }
}

/* ===================== 5. 背景の星 ===================== */
function initStars() {
  const cv = $('#starfield'); if (!cv) return;
  const cx = cv.getContext('2d'); if (!cx) return;
  let stars = [], w = 0, h = 0, raf = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(w * h / 9000);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.25 + 0.35,
      a: Math.random() * 0.6 + 0.25,
      s: Math.random() * 0.014 + 0.004,
      p: Math.random() * Math.PI * 2
    }));
  }
  function draw() {
    cx.clearRect(0, 0, w, h);
    for (const st of stars) {
      st.p += st.s;
      const a = st.a + Math.sin(st.p) * 0.28;
      cx.globalAlpha = clamp(a, 0.05, 1);
      cx.fillStyle = st.r > 1.1 ? '#bcd4ff' : '#ffffff';
      cx.beginPath(); cx.arc(st.x, st.y, st.r, 0, 6.284); cx.fill();
    }
    cx.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); resize(); if (!reduce) draw(); });
  if (reduce) { cx.globalAlpha = .6; stars.forEach(s => { cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.284); cx.fill(); }); }
  else draw();
}

/* ===================== 6. 共通UI ===================== */
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function modal(opt) {
  $('#mdIco').textContent = opt.ico || '✦';
  $('#mdTitle').textContent = opt.title || '';
  $('#mdText').textContent = opt.text || '';
  const area = $('#mdArea');
  area.classList.toggle('show', !!opt.area);
  area.value = opt.areaValue || '';
  area.readOnly = !!opt.readonly;
  const acts = $('#mdActions'); acts.innerHTML = '';
  (opt.actions || []).forEach(a => {
    const b = el('button', 'btn btn-lg' + (a.cls ? ' ' + a.cls : ''), a.label);
    b.type = 'button';
    b.addEventListener('click', () => { if (a.run) a.run(area.value); if (a.keep !== true) closeModal(); });
    acts.appendChild(b);
  });
  $('#modal').classList.add('show');
}
function closeModal() { $('#modal').classList.remove('show'); }

function flyXP(amount, x, y) {
  const n = el('div', 'xpfly', '+' + amount + ' XP');
  n.style.left = (x - 30) + 'px'; n.style.top = y + 'px';
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1050);
}

/* ===================== 7. ヘッダーの表示更新 ===================== */
let heartTick = 0;
function renderTop() {
  regenHearts();
  $('#streakVal').textContent = S.streak;
  $('#xpVal').textContent = S.xp;
  $('#heartVal').textContent = S.hearts;
  const ms = heartLeftMs();
  $('#heartTimer').textContent = ms > 0
    ? `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}`
    : '';
  const got = S.daily[todayKey()] || 0;
  const ratio = clamp(got / S.goal, 0, 1);
  $('#goalRing').style.strokeDashoffset = String(100.5 * (1 - ratio));
  $('#goalTxt').textContent = ratio >= 1 ? '✓' : Math.round(ratio * 100);
  $('#tbGoal').title = `今日の目標 ${got} / ${S.goal} XP`;
}
function startHeartTick() {
  clearInterval(heartTick);
  heartTick = setInterval(() => { const b = S.hearts; regenHearts(); renderTop(); if (S.hearts !== b) { save(); if (view === 'home') renderHome(); } }, 1000);
}

/* ===================== 8. 画面切り替え ===================== */
let view = 'home';
function go(name) {
  view = name;
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + name));
  $$('.nav-btn').forEach(b => b.classList.toggle('is-on', b.dataset.go === name));
  document.body.classList.toggle('in-lesson', name === 'lesson' || name === 'result');
  if (name === 'home') renderHome();
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  const sc = $('#screen-' + name); if (sc) sc.scrollTop = 0;
}

/* ===================== 9. ホーム（星図マップ） ===================== */
let curUnit = 0;

function renderHome() {
  const li = levelInfo(S.xp);
  $('#heroTitle').innerHTML = S.streak > 0
    ? `${S.streak}日連続で<br>星をつないでいます`
    : '星をたどって<br>英語を進もう';
  $('#heroSub').textContent = `レベル ${li.lv} ・ 次のレベルまで あと ${li.need - li.cur} XP`;
  $('#lvFill').style.width = (li.ratio * 100) + '%';

  // ユニットタブ
  const tabs = $('#unitTabs'); tabs.innerHTML = '';
  UNITS.forEach((u, i) => {
    const open = unitOpen(i);
    const b = el('button', 'utab' + (i === curUnit ? ' is-on' : '') + (open ? '' : ' is-lock'));
    b.type = 'button';
    b.innerHTML = `<span>${open ? u.icon : '🔒'}</span>${u.name}<b>${unitDone(i)}/${u.lessons.length}</b>`;
    b.addEventListener('click', () => {
      if (!open) { toast(`「${UNITS[i - 1].name}」を3レッスン終えると開きます`); sfx.ng(); return; }
      curUnit = i; sfx.tap(); renderHome();
      tabs.scrollTo({ left: b.offsetLeft - 60, behavior: 'smooth' });
    });
    tabs.appendChild(b);
  });

  // ユニット見出し
  const U = UNITS[curUnit], dn = unitDone(curUnit), tot = U.lessons.length;
  $('#unitHead').innerHTML =
    `<p class="uh-name">${U.icon} ${U.name}</p>
     <p class="uh-desc">${U.desc}</p>
     <div class="uh-bar"><span style="width:${dn / tot * 100}%"></span></div>
     <div class="uh-meta"><span>${dn} / ${tot} レッスン</span><span>${Math.round(dn / tot * 100)}%</span></div>`;

  // 星図パス
  const path = $('#lessonPath'); path.innerHTML = '';
  U.lessons.forEach((L, i) => {
    const done = isDone(curUnit, i), open = lessonOpen(curUnit, i);
    const now = open && !done;
    const node = el('div', 'node ' + (done ? 'done' : now ? 'now' : 'lock'));
    const off = [0, 54, 78, 34, -34, -78, -54][i % 7];
    node.style.transform = `translateX(${off}px)`;

    const flag = el('span', 'flag ' + (off > 0 ? 'l' : 'r'), String(i + 1).padStart(2, '0'));
    const btn = el('button', 'node-btn', done ? '✓' : open ? L.icon : '🔒');
    btn.type = 'button';
    btn.setAttribute('aria-label', `${L.name}${open ? '' : '（未開放）'}`);
    btn.addEventListener('click', () => {
      if (!open) { toast('前のレッスンを終えると開きます'); sfx.ng(); return; }
      startLesson(curUnit, i);
    });

    const rec = S.done[lessonKey(curUnit, i)];
    const stars = el('div', 'stars', rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '');

    node.appendChild(flag);
    node.appendChild(btn);
    node.appendChild(el('p', 'node-name', L.name));
    node.appendChild(el('p', 'node-sub', L.qs.length + ' 問'));
    node.appendChild(stars);
    path.appendChild(node);
  });
  renderTop();
}

/* ===================== 10. レッスン ===================== */
const L = {
  unit: 0, idx: 0, queue: [], pos: 0, wrongCount: 0,
  answered: false, correctNow: false, picked: null, arranged: [], startAt: 0, gained: 0, retry: []
};

function startLesson(u, i) {
  regenHearts();
  if (S.hearts <= 0) {
    const ms = heartLeftMs();
    modal({
      ico: '💔', title: 'ライフが切れました',
      text: `あと ${Math.ceil(ms / 60000)} 分で1つ回復します。設定から満タンにすることもできます。`,
      actions: [{ label: '閉じる' }, { label: '設定を開く', cls: 'btn-ghost', run: () => go('settings') }]
    });
    sfx.ng(); return;
  }
  ac();
  L.unit = u; L.idx = i;
  L.queue = shuffle(UNITS[u].lessons[i].qs);
  L.pos = 0; L.wrongCount = 0; L.gained = 0; L.retry = [];
  L.startAt = Date.now();
  go('lesson');
  showQuestion();
}

function curQ() { return L.queue[L.pos]; }

function renderLessonHUD() {
  $('#qFill').style.width = (L.pos / L.queue.length * 100) + '%';
  const h = $('#lessonHearts'); h.innerHTML = '';
  for (let i = 0; i < HEART_MAX; i++) {
    const n = el('i', i < S.hearts ? '' : 'off', '❤️');
    h.appendChild(n);
  }
}

const KIND_LABEL = { ch: '4択で答える', ar: '英文を並べかえる', sp: 'つづりを入力', ls: '聞いて意味を選ぶ' };

function showQuestion() {
  L.answered = false; L.correctNow = false; L.picked = null; L.arranged = [];
  const q = curQ();
  renderLessonHUD();

  $('#feedback').className = 'feedback';
  const chk = $('#checkBtn');
  chk.className = 'btn btn-lg'; chk.textContent = '確認する'; chk.disabled = true;

  const kind = q.au ? (q.t === 'sp' ? '聞いて書き取る' : '聞いて並べかえる') : KIND_LABEL[q.t];
  $('#qKind').textContent = kind;
  const body = $('#qBody'); body.innerHTML = '';

  if (q.t === 'ch') buildChoice(q, body);
  else if (q.t === 'ls') buildListen(q, body);
  else if (q.t === 'ar') buildArrange(q, body);
  else buildSpell(q, body);

  $('#screen-lesson').scrollTop = 0;
  $('.q-wrap').scrollTop = 0;
}

/* --- 4択 --- */
function buildChoice(q, body) {
  $('#qPrompt').innerHTML = escapeHTML(q.p);
  const opts = shuffle([q.a, ...q.w]);
  opts.forEach((text, i) => {
    const b = el('button', 'opt'); b.type = 'button';
    b.appendChild(el('span', 'kbd', String(i + 1)));
    b.appendChild(el('span', 'opt-txt', text));
    b.dataset.val = text;
    b.addEventListener('click', () => {
      if (L.answered) return;
      $$('.opt', body).forEach(o => o.classList.remove('sel'));
      b.classList.add('sel'); L.picked = text; sfx.tap();
      $('#checkBtn').disabled = false;
      if (hasLatin(text) && text.split(' ').length > 1) speak(text);
    });
    body.appendChild(b);
  });
}

/* --- リスニング（意味を選ぶ） --- */
function buildListen(q, body) {
  $('#qPrompt').textContent = '聞こえた英文の意味は?';
  body.appendChild(speakerRow(q.p));
  const reveal = el('p', 'reveal', ''); body.appendChild(reveal);
  const opts = shuffle([q.a, ...q.w]);
  opts.forEach((text, i) => {
    const b = el('button', 'opt'); b.type = 'button';
    b.appendChild(el('span', 'kbd', String(i + 1)));
    b.appendChild(el('span', 'opt-txt', text));
    b.dataset.val = text;
    b.addEventListener('click', () => {
      if (L.answered) return;
      $$('.opt', body).forEach(o => o.classList.remove('sel'));
      b.classList.add('sel'); L.picked = text; sfx.tap();
      $('#checkBtn').disabled = false;
    });
    body.appendChild(b);
  });
  if (S.autoSpeak) setTimeout(() => speak(q.p), 380);
}

function speakerRow(text) {
  const wrap = el('div', 'speak-wrap');
  const main = el('button', 'speak-btn', '🔊'); main.type = 'button';
  main.setAttribute('aria-label', 'もう一度聞く');
  main.addEventListener('click', () => { speak(text); main.classList.remove('ringing'); void main.offsetWidth; main.classList.add('ringing'); });
  const slow = el('button', 'speak-slow', '🐢'); slow.type = 'button';
  slow.setAttribute('aria-label', 'ゆっくり聞く');
  slow.addEventListener('click', () => speak(text, Math.max(0.45, S.rate - 0.35)));
  wrap.appendChild(main); wrap.appendChild(slow);
  return wrap;
}

/* --- 並び替え --- */
function buildArrange(q, body) {
  if (q.au) {
    $('#qPrompt').textContent = '聞こえた英文を並べかえよう';
    body.appendChild(speakerRow(q.a));
    body.appendChild(el('p', 'hintline')).appendChild(el('span', null, 'ヒント: ' + q.p));
    if (S.autoSpeak) setTimeout(() => speak(q.a), 380);
  } else {
    $('#qPrompt').textContent = q.p;
  }

  const slot = el('div', 'slot');
  const bank = el('div', 'bank');
  body.appendChild(slot); body.appendChild(bank);

  const words = q.a.split(' ');
  let order = shuffle(words);
  if (words.length > 2 && order.join(' ') === q.a) order = shuffle(order);

  order.forEach((w, i) => {
    const c = el('button', 'chip', w); c.type = 'button'; c.dataset.i = String(i);
    c.addEventListener('click', () => {
      if (L.answered || c.classList.contains('ghost')) return;
      c.classList.add('ghost');
      const picked = el('button', 'chip in', w); picked.type = 'button';
      picked.addEventListener('click', () => {
        if (L.answered) return;
        picked.remove(); c.classList.remove('ghost'); sfx.tap(); syncArrange();
      });
      slot.appendChild(picked); sfx.tap(); syncArrange();
    });
    bank.appendChild(c);
  });

  function syncArrange() {
    L.arranged = $$('.chip.in', slot).map(n => n.textContent);
    $('#checkBtn').disabled = L.arranged.length === 0;
  }
}

/* --- スペル入力 --- */
function buildSpell(q, body) {
  if (q.au) {
    $('#qPrompt').textContent = '聞こえた単語を書こう';
    body.appendChild(speakerRow(q.a));
    if (S.autoSpeak) setTimeout(() => speak(q.a), 380);
  } else {
    $('#qPrompt').innerHTML = `「${escapeHTML(q.p)}」を英語で`;
  }

  const inp = el('input', 'spell-in');
  inp.type = 'text'; inp.autocomplete = 'off'; inp.autocapitalize = 'off';
  inp.spellcheck = false; inp.placeholder = 'ここに英語で入力';
  inp.addEventListener('input', () => { $('#checkBtn').disabled = inp.value.trim() === ''; });
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); if (!$('#checkBtn').disabled && !L.answered) doCheck(); }
  });
  body.appendChild(inp);

  const hint = el('div', 'hintline');
  hint.appendChild(el('span', null, `${q.a.length} 文字`));
  const hb = el('b', null, q.a[0] + ' _'.repeat(Math.max(0, q.a.length - 1)));
  hint.appendChild(hb);
  body.appendChild(hint);

  if (!q.au) setTimeout(() => inp.focus({ preventScroll: true }), 250);
}

function escapeHTML(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const normSpell = s => String(s).toLowerCase().trim().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');

/* --- 採点 --- */
function doCheck() {
  if (L.answered) return;
  const q = curQ();
  let ok = false, yours = '';

  if (q.t === 'ch' || q.t === 'ls') {
    yours = L.picked || '';
    ok = yours === q.a;
    $$('#qBody .opt').forEach(o => {
      o.classList.add('locked');
      if (o.dataset.val === q.a) o.classList.add('ok');
      else if (o.dataset.val === yours) o.classList.add('ng');
    });
    if (q.t === 'ls') { const r = $('#qBody .reveal'); if (r) r.textContent = q.p; }
  } else if (q.t === 'ar') {
    yours = L.arranged.join(' ');
    ok = normSpell(yours) === normSpell(q.a);
  } else {
    const inp = $('#qBody .spell-in');
    yours = inp ? inp.value : '';
    ok = normSpell(yours) === normSpell(q.a);
    if (inp) { inp.classList.add(ok ? 'ok' : 'ng'); inp.blur(); }
  }

  L.answered = true; L.correctNow = ok;
  const fb = $('#feedback');

  if (ok) {
    S.correct++;
    L.gained += 10;
    sfx.ok();
    $('#fbTitle').textContent = ['正解!', 'その調子!', 'ばっちり!', 'すばらしい!'][Math.floor(Math.random() * 4)];
    $('#fbText').innerHTML = hasLatin(q.a) ? `<b>${escapeHTML(q.a)}</b>` : escapeHTML(q.a);
    fb.className = 'feedback show good';
    $('#nextBtn').className = 'btn btn-lg btn-ok';
    const r = $('#checkBtn').getBoundingClientRect();
    flyXP(10, r.left + r.width / 2, r.top);
  } else {
    S.wrong++; L.wrongCount++;
    S.hearts = Math.max(0, S.hearts - 1);
    if (S.hearts === HEART_MAX - 1) S.heartAt = Date.now();
    L.retry.push(q);
    sfx.ng();
    const hs = $$('#lessonHearts i');
    if (hs[S.hearts]) { hs[S.hearts].classList.add('off', 'pop'); }
    $('#fbTitle').textContent = 'おしい!正解はこちら';
    $('#fbText').innerHTML = hasLatin(q.a)
      ? `<b>${escapeHTML(q.a)}</b>` + (q.t === 'ls' ? `<br>${escapeHTML(q.p)}` : '')
      : escapeHTML(q.a) + (q.t === 'ls' ? `<br><b>${escapeHTML(q.p)}</b>` : '');
    fb.className = 'feedback show bad';
    $('#nextBtn').className = 'btn btn-lg btn-ng';
  }

  if (hasLatin(q.a) && q.t !== 'ls') speak(q.a);
  save(); renderTop();
  $('#checkBtn').disabled = true;
  setTimeout(() => $('#nextBtn').focus({ preventScroll: true }), 60);
}

function nextQuestion() {
  $('#feedback').className = 'feedback';
  if (S.hearts <= 0) { setTimeout(gameOver, 260); return; }
  L.pos++;
  if (L.pos >= L.queue.length) {
    // 間違えた問題を最後にもう一度出す
    if (L.retry.length) { L.queue = L.queue.concat(shuffle(L.retry)); L.retry = []; }
    else { setTimeout(finishLesson, 240); return; }
  }
  setTimeout(showQuestion, 200);
}

function gameOver() {
  sfx.fail();
  modal({
    ico: '💔', title: 'ライフがなくなりました',
    text: 'このレッスンの進みは記録されません。ライフが回復したら、もう一度ここから挑戦しましょう。',
    actions: [{ label: 'マップに戻る', run: () => go('home') }]
  });
}

function finishLesson() {
  const total = UNITS[L.unit].lessons[L.idx].qs.length;
  const stars = L.wrongCount === 0 ? 3 : L.wrongCount <= 2 ? 2 : 1;
  const bonus = L.wrongCount === 0 ? 20 : 0;
  const xp = L.gained + bonus;
  const sec = Math.round((Date.now() - L.startAt) / 1000);
  const acc = Math.round(total / (total + L.wrongCount) * 100);

  const key = lessonKey(L.unit, L.idx);
  const before = S.done[key];
  S.done[key] = { stars: Math.max(stars, before ? before.stars : 0), best: Math.max(xp, before ? before.best : 0) };
  S.totalLessons++;
  if (L.wrongCount === 0) S.perfects++;

  const lvBefore = levelInfo(S.xp).lv;
  S.xp += xp;
  markToday(xp);
  const lvAfter = levelInfo(S.xp).lv;
  save();

  $('#resBadge').textContent = stars === 3 ? '👑' : stars === 2 ? '⭐' : '✦';
  $('#resTitle').textContent = stars === 3 ? 'パーフェクト!' : 'レッスン完了';
  $('#resSub').textContent = `${UNITS[L.unit].name} ・ ${UNITS[L.unit].lessons[L.idx].name}` +
    (bonus ? '（ノーミスボーナス +20 XP）' : '');
  $('#resXp').textContent = '+' + xp;
  $('#resAcc').textContent = acc + '%';
  $('#resTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  go('result');
  if (lvAfter > lvBefore) { sfx.level(); setTimeout(() => toast(`レベル ${lvAfter} になりました!`), 700); }
  else sfx.clear();

  if ((S.daily[todayKey()] || 0) >= S.goal) setTimeout(() => toast('今日の目標を達成しました 🎉'), 1400);
}

function quitLesson() {
  modal({
    ico: '🚪', title: 'レッスンをやめますか?',
    text: 'ここまでの進みは記録されません。',
    actions: [
      { label: 'つづける', cls: 'btn-ghost' },
      { label: 'やめる', cls: 'btn-danger', run: () => go('home') }
    ]
  });
}

/* ===================== 11. 記録 ===================== */
function renderStats() {
  const li = levelInfo(S.xp);
  const total = S.correct + S.wrong;
  const acc = total ? Math.round(S.correct / total * 100) : 0;
  $('#statGrid').innerHTML = `
    <div class="stat a"><b>${li.lv}</b><small>レベル</small></div>
    <div class="stat g"><b>${S.streak}</b><small>連続日数（最高 ${S.bestStreak}）</small></div>
    <div class="stat m"><b>${S.xp}</b><small>合計XP</small></div>
    <div class="stat c"><b>${acc}%</b><small>通算正答率（${total}問）</small></div>
    <div class="stat"><b>${doneCount()}</b><small>クリアしたレッスン</small></div>
    <div class="stat"><b>${S.totalLessons}</b><small>プレイ回数</small></div>
    <div class="stat"><b>${S.perfects}</b><small>ノーミス達成</small></div>
    <div class="stat"><b>${S.correct}</b><small>正解した問題</small></div>`;

  // 直近7日
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ k, xp: S.daily[k] || 0, label: '日月火水木金土'[d.getDay()] });
  }
  const max = Math.max(S.goal, ...days.map(d => d.xp));
  $('#weekChart').innerHTML = days.map((d, i) => `
    <div class="wcol${i === 6 ? ' today' : ''}">
      <div class="wbar" style="height:${Math.max(4, d.xp / max * 88)}%"></div>
      <small>${d.label}</small>
    </div>`).join('');

  $('#progList').innerHTML = UNITS.map((u, i) => {
    const dn = unitDone(i), tot = u.lessons.length;
    return `<div class="prow">
      <div class="prow-top"><span>${u.icon} ${u.name}</span><i>${dn}/${tot}</i></div>
      <div class="prow-bar"><span style="width:${dn / tot * 100}%"></span></div>
    </div>`;
  }).join('');

  const ctx = { xp: S.xp, totalLessons: S.totalLessons, doneCount: doneCount(), bestStreak: S.bestStreak, perfects: S.perfects };
  $('#badgeList').innerHTML = BADGES.map(b => {
    const got = b.test(ctx);
    return `<div class="badge${got ? ' got' : ''}"><span>${b.ico}</span><small>${b.name}</small></div>`;
  }).join('');
}

/* ===================== 12. 設定 ===================== */
function renderSettings() {
  $('#swSound').setAttribute('aria-checked', String(S.sound));
  $('#swAuto').setAttribute('aria-checked', String(S.autoSpeak));
  $('#rateRange').value = String(S.rate);
  $('#rateTxt').textContent = S.rate.toFixed(2).replace(/0$/, '') + ' 倍';
  $('#goalRange').value = String(S.goal);
  $('#goalSetTxt').textContent = S.goal + ' XP';
}

function bindSettings() {
  $('#swSound').addEventListener('click', () => {
    S.sound = !S.sound; save(); renderSettings(); if (S.sound) sfx.ok();
  });
  $('#swAuto').addEventListener('click', () => { S.autoSpeak = !S.autoSpeak; save(); renderSettings(); });
  $('#rateRange').addEventListener('input', e => {
    S.rate = parseFloat(e.target.value); $('#rateTxt').textContent = S.rate.toFixed(2).replace(/0$/, '') + ' 倍';
  });
  $('#rateRange').addEventListener('change', () => { save(); speak('This is the reading speed.'); });
  $('#goalRange').addEventListener('input', e => {
    S.goal = parseInt(e.target.value, 10); $('#goalSetTxt').textContent = S.goal + ' XP';
  });
  $('#goalRange').addEventListener('change', () => { save(); renderTop(); });

  $('#btnRefill').addEventListener('click', () => {
    S.hearts = HEART_MAX; S.heartAt = Date.now(); save(); renderTop(); sfx.ok(); toast('ライフを満タンにしました');
  });

  $('#btnExport').addEventListener('click', () => {
    modal({
      ico: '📤', title: '学習データの書き出し', text: '下のテキストをコピーして保存してください。',
      area: true, readonly: true, areaValue: JSON.stringify(S),
      actions: [
        { label: 'コピーする', keep: true, run: v => {
            if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => toast('コピーしました'), () => toast('コピーできませんでした'));
            else toast('手動で選択してコピーしてください');
          } },
        { label: '閉じる', cls: 'btn-ghost' }
      ]
    });
  });

  $('#btnImport').addEventListener('click', () => {
    modal({
      ico: '📥', title: '学習データの読み込み', text: '書き出したJSONを貼り付けてください。今のデータは上書きされます。',
      area: true, areaValue: '',
      actions: [
        { label: '読み込む', run: v => {
            try {
              const obj = JSON.parse(v);
              if (!obj || typeof obj !== 'object' || typeof obj.xp !== 'number') throw new Error('bad');
              S = Object.assign(defaultState(), obj);
              save(); renderTop(); renderSettings(); toast('読み込みました'); sfx.ok();
            } catch (e) { toast('読み込めませんでした。形式を確認してください'); sfx.ng(); }
          } },
        { label: 'やめる', cls: 'btn-ghost' }
      ]
    });
  });

  $('#btnReset').addEventListener('click', () => {
    modal({
      ico: '⚠️', title: '最初からやり直しますか?',
      text: '進捗・XP・連続日数・記録がすべて消えます。この操作は取り消せません。',
      actions: [
        { label: 'やめる', cls: 'btn-ghost' },
        { label: 'すべて削除する', cls: 'btn-danger', run: () => {
            S = defaultState(); curUnit = 0; save(); renderTop(); renderSettings(); toast('リセットしました');
          } }
      ]
    });
  });
}

/* ===================== 13. 起動 ===================== */
function bindGlobal() {
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => { sfx.tap(); go(b.dataset.go); }));
  $('#checkBtn').addEventListener('click', doCheck);
  $('#nextBtn').addEventListener('click', nextQuestion);
  $('#quitBtn').addEventListener('click', quitLesson);
  $('#resHome').addEventListener('click', () => go('home'));
  $('#resAgain').addEventListener('click', () => startLesson(L.unit, L.idx));
  $('#tbHearts').addEventListener('click', () => {
    const ms = heartLeftMs();
    toast(S.hearts >= HEART_MAX ? 'ライフは満タンです' : `あと ${Math.ceil(ms / 60000)} 分で1つ回復します`);
  });
  $('#tbStreak').addEventListener('click', () => toast(`連続 ${S.streak} 日（最高 ${S.bestStreak} 日）`));
  $('#tbXp').addEventListener('click', () => go('stats'));
  $('#tbGoal').addEventListener('click', () => toast(`今日 ${S.daily[todayKey()] || 0} / ${S.goal} XP`));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  document.addEventListener('keydown', e => {
    if ($('#modal').classList.contains('show')) { if (e.key === 'Escape') closeModal(); return; }
    if (view !== 'lesson') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (L.answered) nextQuestion();
      else if (!$('#checkBtn').disabled) doCheck();
      return;
    }
    if (e.key === 'Escape') { quitLesson(); return; }
    if (/^[1-4]$/.test(e.key) && !L.answered) {
      const opts = $$('#qBody .opt');
      const target = opts[parseInt(e.key, 10) - 1];
      if (target) target.click();
    }
  });

  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  document.addEventListener('pointerdown', () => ac(), { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { regenHearts(); renderTop(); } });
}

function init() {
  load();
  initStars();
  bindGlobal();
  bindSettings();
  // 最初に開くユニットは「まだ終わっていない一番手前」
  curUnit = 0;
  for (let u = 0; u < UNITS.length; u++) {
    if (unitOpen(u) && unitDone(u) < UNITS[u].lessons.length) { curUnit = u; break; }
  }
  go('home');
  startHeartTick();
  if (memoryOnly) setTimeout(() => toast('この環境では進捗が保存されません'), 1200);
}

document.addEventListener('DOMContentLoaded', init);
