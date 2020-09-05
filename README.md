# ESFilter

- 画像の自動分類・文字認識を行います
- ウェブサーバーとして動作し，ウェブブラウザ上から画像の閲覧やアプリケーションの操作が行えます

## 注意

- このソフトウェアはウェブサーバーとして動作しますが，セキュリティを考慮して作っていないので，悪意のある人間から見える場所で動かさないでください
- Internet Explorer では動きません

## 動作環境

Windows 8.1 64bit 版で動作を確認しています．その他の OS でも Node.js が動く環境であればどこでも動くと思われます．

## インストールと実行

1. node.js をインストール https://nodejs.org/  
（2019/11/13 現在の最新推奨版 12.13.0 LTS で動作確認しています）
1. ソースコードをダウンロードし，ソースコードの最上位ディレクトリ（package.json があるディレクトリ）でコマンドプロンプトまたは PowerShell を開いて以下を実行
    ```
    > npm install
    > npx tsc
    > npx webpack
    ```
1. ポートを指定して起動
    ```
    > set PORT=80
    > node esfilter
    ```

## 使い方

### フィルターの作成と実行

1. 起動後作成される images/@unclassified ディレクトリに分類したい画像を入れておきます
1. ESFilter が動作しているポートをウェブブラウザから開きます
1. 「フィルター設定」＞「フィルター一覧」＞「新規作成」を押し，適当なフィルター名を入力します
1. フィルターのパラメーターを入力します
    - 条件は必要な数だけ追加でき，すべての条件を満たした画像（AND 条件）が，フィルターにヒットしたとみなされます
    - OR 条件は指定できません．指定したい場合は必要な数だけ別にフィルターを作成してください
1. 入力が完了してフィルター一覧に戻ったら，作成したフィルターを選択して画面下部の「単独で実行する」を押すとフィルターが実行されます

### 複数フィルターの一括実行と自動実行

1. フィルターを作成した後，フィルター一覧画面で一括実行したいフィルターを選択し，画面下部の「有効にする」を押します
1. 画面上部「フィルターの自動実行」の「単発で実行する」を押すと，有効にしているすべてのフィルターが一括実行されます
    - どのフィルターにもヒットしなかった画像は @unmatched フォルダーへ移動されます
1. 「フィルターの自動実行」の「有効にする」を押すと，@unclassified フォルダーを継続的に監視して，新たに追加されたファイルに対しても自動でフィルターを実行します

### 言語データの追加と変更

* tessdata 以下に Tesseract の言語データ (\*.traineddata) またはそれを圧縮したファイル (\*.traineddata.gz) を入れると，文字認識に使用する言語データとして，フィルターの設定で指定できるようになります
* 標準で [tesseract_best](https://github.com/tesseract-ocr/tessdata_best) の jpn.traineddata と jpn_vert.traineddata を入れてあります

## 更新履歴

- 0.5.0 - 2020/11/15 - フィルターを最上位・最下位へ移動する機能，言語データを追加する機能，白抜き文字の認識を補助する機能の追加
- 0.4.2 - 2019/11/28 - ユーザーインターフェースの調整，バグ修正
- 0.4.1 - 2019/11/24 - ナビゲーションのリンクの修正
- 0.4.0 - 2019/11/24 - ユーザーインターフェースの調整
- 0.3.0 - 2019/11/23 - 文字色カラーピッカー，類似文字混同検索，画像をフォルダーごと未分類に戻す機能の追加，ベース URL を変更できるよう修正
- 0.2.0 - 2019/11/19 - 検索機能の追加
- 0.1.0 - 2019/11/17 - 文字認識機能の追加
- 0.0.1 - 2019/11/13 - 公開
