# KomenoTV 引き継ぎ

更新: 2026-10-15

## 現在の状態

- 正本: C:\Users\rikou\Workspace\KonomiTV、ブランチ codex/commander-ui。
- 車載版: https://100-119-2-23.local.konomi.tv:7100/tv/
- 初期実装とこのPCへの配置は完了。2026-10-15のユーザー提供写真でCX-5上の車載UIと番組映像の表示を確認。今回の自動非表示を含む実機テストはユーザーが担当する。映像の進行・音声・個々の入力イベントの直接検証は未実施。
- 家庭用 https://100-119-2-23.local.konomi.tv:7000/tv/ は変更なし。前後のHTML SHA-256と既存7000/7010のPIDが一致。
- 既存サーバーは0.13.0-dev / EDCB / NVEncC、フォークは0.14.1。バックエンドを更新せず、車載フロントエンドとGET限定中継だけを追加した。
- 7100はTailscale 100.119.2.23だけでHTTPS待受、7110は127.0.0.77だけでHTTP待受。既存Akebi実行ファイルを別プロセスで使用。ファイアウォール設定の変更なし。
- 自動起動は現在のWindowsユーザーのStartup/KomenoTV.lnk。標準Windows PowerShellからの起動と重複起動防止を確認。Windows再起動後の確認は未実施。

## 実装した操作

- 480p HEVC固定、コメント接続なし、800x480、前回局を車載オリジンだけに保存。
- 回転 / 方向キー / Tab / ホイール / 局ボタンへのフォーカスで候補を選び、500ms停止後に最後の候補だけへ切り替え。
- 5秒無操作で下部のチャンネル一覧だけを隠し、回転・フォーカス移動・pointer入力・Backで再表示/時間リセット。自動非表示では映像・チャンネルを変えない。
- 押し込み / Enter / SpaceでWeb画面のメニューを隠す。Back / Escapeでメニューを戻す。手動の全画面表示中は選局しても全画面を維持する。
- 局変更・ページ退出・バックグラウンド化で旧配信接続を破棄。表示復帰・onlineで再接続。
- HEVC非対応は案内を出し、別コーデックへ黙って変更しない。再生エラーは押し込みまたは再試行で復旧。
- Android AutoのドックやFermataのネイティブバーはWeb画面から制御できない。

## 確認済み

- Node 20.20.2、Yarn 1.22.22、frozen-lockfile install、lint、vue-tsc、build:car成功。依存追加・lockfile変更なし。
- 回帰テスト19件合格: 選局debounce、復元、折返し、キャンセル、再生の世代管理・再試行、プロキシのGET制限・パス制限・接続解放。
- Edgeの800x480画面でキー・ホイール・rootへのwheel・フォーカス選局、Enter、Escape、ブラウザBack、再読込復元を確認。コンソールエラー、コメントWebSocket、設定書き込みは0。
- 新HTTPSポートからFFprobeでhevc / 854x480 / AACを確認。FFmpegで実配信1フレームをデコードして接続を終了。終了後healthのactiveStreams=0。
- 初回表示中のバックグラウンド化では接続せず、表示復帰で480p HEVCへ接続することもブラウザで確認。この検証だけはPCのHEVC能力判定を模擬し、再生成功の根拠にはしていない。
- 自動非表示更新: 800x480のブラウザで5秒後の下部のみ非表示、回転/フォーカス/Back/Escapeによる再表示、履歴の重複防止、手動全画面の維持を確認。反映前後で家庭用HTML・7000/7010のPIDは一致し、視聴中の車載接続数は1のまま。サービス再起動・旧配布資産の削除なし。
- このPCのEdgeはMSE HEVC非対応。Edgeで映像再生できたとは扱わない。
- 独立した読み取りレビューとメインレビューを実施。家庭用経路を変更する指摘なし。
- Yarn audit: high 19 / moderate 2 / critical 0（依存経路の件数）。主にlint/build用、web-bmlのXMLBuilderも含む。車載画面はBMLを起動しない。上流依存の一括更新はしていない。

## 起動・停止・更新

    .\scripts\Start-KomenoTV.ps1
    .\scripts\Start-KomenoTV.ps1 -Stop

停止は記録したPIDと開始時刻が一致する車載プロセスだけが対象。家庭用サービスを再起動しない。
client/でNode 20を使用して corepack yarn build:car を実行。出力はdist-car/で、通常のdist/を上書きしない。
配布資産の更新は利用者が視聴していない時に行う。既存のService Worker更新通知で再読込される。

ローカル検証証跡はGit対象外の .komeno/ に保存:

- tests-final.log、build-car.log、browser-acceptance.json、browser-acceptance.cjs、browser-background.json
- auto-hide-tests.log、auto-hide-build.log、auto-hide-browser.json、auto-hide-browser.cjs、auto-hide-visible.png、auto-hide-hidden.png
- car-menu-800x480.png、car-fullscreen-800x480.png、480p-hevc-frame.png
- household-before.json、household-after.json、dependency-audit.jsonl
- processes.json、gateway/httpsの時刻付きログ

## 次の確認

Pixel 8のFermataから7100のURLを開き、HEVC映像・押し込み・戻る・回転を停車中に確認する。前回確認時のADB接続端末は0台。今回の実機テストはユーザーが担当し、こちらでの実車入力の直接検証は未実施。音声の実聴、通信断からの実機復旧、長時間安定性も未確認。
端末導入などの過去の根拠は C:\Users\rikou\Documents\ChatGPT\AndroidAuto\HANDOFF.md と artifacts/ を参照。
