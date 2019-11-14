# ESFilter

- あらかじめ設定したプリセットをもとに画像を分類します
- 指定領域を手本画像と比較し，差分を計算することで画像を識別します
- ウェブサーバーとして動作し，アプリケーションの操作や画像の閲覧はウェブブラウザから行います

## 注意

- このソフトウェアはウェブサーバーとして動作しますが，セキュリティを考慮して作っていないので，悪意のある利用者から見える場所で動かさないでください
- Internet Explorer では動きません

## インストールと実行

1. node.js をインストール https://nodejs.org/  
（2019/11/13 現在の最新推奨版 12.13.0 LTS で動作確認しています）
1. ソースコードをダウンロードし最上位ディレクトリ（package.json があるディレクトリ）で以下を実行
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

1. 起動後作成される images ディレクトリ内に @unclassified というディレクトリを作成し，そこに分類したい画像を入れておきます
1. ESFilter を起動したポートにウェブブラウザからアクセスします
1. 「フィルター設定」＞「フィルター一覧」＞「新規作成」を押し，フィルター名を入力します
1. 必要なパラメータを指定してフィルターを作成します
    - 比較領域の「領域を表示」を押すと，比較対象領域をマウスで指定できます
    - 条件は必要な数だけ追加でき，すべての条件を満たした画像（AND 条件）が，フィルターにヒットしたとみなされます
    - OR 条件は指定できません．指定したい場合は必要な数だけ別にフィルターを作成してください
    - 「フィルターの動作テスト」から，フィルターの動作をブラウザ上でテストできます
1. 上記を繰り返して必要な数だけフィルターを作成したら，個々のフィルターの自動実行を有効にします
1. 全体の自動実行を有効にすると分類が開始されます
    - 結果はログから確認できます
    - どのフィルターにもヒットしなかった画像は @unmatched フォルダーへ移動されます
    - さきに個々の自動実行を有効にしてから全体を有効にしないと，ヒットするフィルターがなかったとして，画像が @unmatched フォルダーに移動されてしまいます

## TODO

- OCR 機能の追加

## 更新履歴

- 0.0.1 - 2019/11/13 - 公開
