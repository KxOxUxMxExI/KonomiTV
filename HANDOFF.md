# KomenoTV 引き継ぎ

更新: 2026-10-15

## 現在の状態

- 正本: C:\Users\rikou\Workspace\KonomiTV、ブランチ codex/commander-ui。
- 車載版: https://100-119-2-23.local.konomi.tv:7100/tv/
- 初期実装とこのPCへの配置は完了。2026-10-15のユーザー提供写真でCX-5上の車載UIと番組映像の表示を確認。最新の回転・押し込み操作を含む実機テストはユーザーが担当する。映像の進行・音声・個々の入力イベントの直接検証は未実施。
- 家庭用 https://100-119-2-23.local.konomi.tv:7000/tv/ は変更なし。前後のHTML SHA-256と既存7000/7010のPIDが一致。
- 既存サーバーは0.13.0-dev / EDCB / NVEncC、フォークは0.14.1。バックエンドを更新せず、車載フロントエンドとGET限定中継だけを追加した。
- 7100はTailscale 100.119.2.23だけでHTTPS待受、7110は127.0.0.77だけでHTTP待受。既存Akebi実行ファイルを別プロセスで使用。ファイアウォール設定の変更なし。
- 自動起動は現在のWindowsユーザーのStartup/KomenoTV.lnk。標準Windows PowerShellからの起動と重複起動防止を確認。Windows再起動後の確認は未実施。

## 実装した操作（2026-10-15の再指定を反映）

- 480p HEVC固定、コメント接続なし、800x480、前回の確定局を車載オリジンだけに保存。可視パネル/ボタン背景は透過・画像なしの黒一色。待機・停止・エラー時は映像を黒で覆い、回転時のメニューはその上に表示する。
- 最初は上部表示と一覧を隠す。回転（wheel / Tab / Shift+Tab）の時だけ両方を表示し、従来とは逆向きに候補を動かす。回転だけでは映像・局を変更しない。
- 押し込み / Enter / Space: 新しい候補があれば選局確定して再生。同じ局または一覧非表示なら現在局の再生・停止を切り替える。押し込み後は上部表示と一覧を同時に隠す。
- 回転停止5秒後に上部表示と一覧を同時に隠し、未確定候補を破棄する。隠れた候補を後から誤って選局しない。
- 戻る・Escape・Backspace・上下左右・PageUp/PageDownはアプリで扱わない。履歴の差し込みとfocusによる選局も削除。以前の押し込み全画面・500ms自動選局の仕様は廃止。
- 再生停止時は配信接続を解放し、online/画面復帰では勝手に再開しない。次の押し込みで同じ局を再生できる。候補局の確定は停止状態からでもその局を再生する。
- 局変更・ページ退出・バックグラウンド化で旧接続を破棄。HEVC非対応は案内を出し、別コーデックへ黙って変更しない。
- Android AutoのドックやFermataのネイティブバーはWeb画面から制御できない。

## 確認済み

- Node 20.20.2、Yarn 1.22.22、frozen-lockfile install、lint、vue-tsc、build:car成功。依存追加・lockfile変更なし。
- 回帰テスト19件合格: 候補と確定の分離、逆回転/折返し、候補期限、復元/キャンセル、再生停止・再開・世代管理、プロキシのGET制限・パス制限・接続解放。
- 旧操作のEdge検証: 800x480画面でキー・ホイール・rootへのwheel・フォーカス選局、Enter、Escape、ブラウザBack、再読込復元を確認。コンソールエラー、コメントWebSocket、設定書き込みは0。
- 新HTTPSポートからFFprobeでhevc / 854x480 / AACを確認。FFmpegで実配信1フレームをデコードして接続を終了。終了後healthのactiveStreams=0。
- 初回表示中のバックグラウンド化では接続せず、表示復帰で480p HEVCへ接続することもブラウザで確認。この検証だけはPCのHEVC能力判定を模擬し、再生成功の根拠にはしていない。
- 旧操作（2b7fa8ff）の自動非表示更新: 800x480のブラウザで5秒後の下部のみ非表示、回転/フォーカス/Back/Escapeによる再表示、履歴の重複防止、手動全画面の維持を確認。反映前後で家庭用HTML・7000/7010のPIDは一致し、視聴中の車載接続数は1のまま。サービス再起動・旧配布資産の削除なし。
- 最新操作: 800x480のブラウザで回転のみ表示、方向反転、押すまで選局しないこと、押し込みで停止/再開、停止状態のonline/画面復帰維持、履歴非干渉を確認。メディアの能力/再生状態と配信は模擬し、実HEVC再生の根拠にはしない。更新版を7100へ反映済み。家庭用HTML・PIDは今回も一致し、サービスを再起動せず旧資産も保持。
- 番組情報の背景修正: Vuetifyのテーマ変数はカンマ区切り（30,19,16）なので、rgb(var(...) / alpha)は無効で透明になっていた。rgba(var(...), alpha)へ修正し、一覧/候補は不透明なテーマ背景色に変更。800x480のブラウザと明るい背景の表示確認で番組文字のコントラスト15.75:1、上下の表示/非表示連動を確認。操作ロジックは変更なし。7100へ反映し、今回も家庭用HTML・PIDは一致。
- 黒背景更新: 800x480のブラウザで各背景がrgb(0,0,0)・background-imageなし、待機表示が画面全体を覆うこと、待機中も選局メニューが上に出ることを確認。明るい模様を映像の代わりに置いた表示用フィクスチャで確認し、実HEVC再生の検証とは分けている。lint/型チェック/車載ビルド成功。7100へ反映済みで、家庭用HTML・PIDは一致。
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
- black-build.log、black-browser.json、black-browser.cjs、black-waiting-800x480.png、black-waiting-menu-800x480.png
- overlay-build.log、overlay-browser.json、overlay-browser.cjs、overlay-visible-800x480.png、overlay-hidden-800x480.png
- commander-tests.log、commander-build.log、commander-browser.json、commander-browser.cjs、commander-candidate-800x480.png
- auto-hide-tests.log、auto-hide-build.log、auto-hide-browser.json、auto-hide-browser.cjs、auto-hide-visible.png、auto-hide-hidden.png
- car-menu-800x480.png、car-fullscreen-800x480.png、480p-hevc-frame.png
- household-before.json、household-after.json、dependency-audit.jsonl
- processes.json、gateway/httpsの時刻付きログ

## 次の確認

Pixel 8のFermataから7100のURLを開き、HEVC映像・逆回転・押し込みでの選局確定と停止/再開を停車中に確認する。前回確認時のADB接続端末は0台。今回の実機テストはユーザーが担当し、こちらでの実車入力の直接検証は未実施。音声の実聴、通信断からの実機復旧、長時間安定性も未確認。
端末導入などの過去の根拠は C:\Users\rikou\Documents\ChatGPT\AndroidAuto\HANDOFF.md と artifacts/ を参照。
