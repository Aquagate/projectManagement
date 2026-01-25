# Project Hub

突発的に生まれるプロジェクトを1ページで管理するローカルWebアプリです。Live Serverなどで静的ファイルとして起動できます。

## 起動方法
1. このフォルダをVS Codeで開きます。
2. `index.html` を Live Server で起動します（または `python -m http.server` でローカルサーバー起動）。
3. ブラウザで `http://localhost:5500` などにアクセスします。

## データ保存場所
- **localStorage**: プロジェクトのメタ情報（一覧・選択中ID・設定）
- **IndexedDB**: 添付ファイル（Blob）と同期ファイルのハンドル

## 同期方法
### File System Access API
1. 「同期ファイルを選択」ボタンから OneDrive 等の同期フォルダ内 `projects.json` を選択します（新規作成も可）。
2. 「保存」で現在のメタ情報を `projects.json` に書き込みます。
3. 「読み込み」で `projects.json` から復元します。
4. 「自動保存」をONにすると変更後に自動保存します。
5. 「添付も同期」をONにすると添付ファイルも同期します（サイズが大きいと時間がかかります）。

**制限事項**: 「添付も同期」をOFFにしている場合、同期ファイルにはメタ情報のみ保存されます。添付ファイルのBlobはブラウザ内（IndexedDB）に残り、同期ファイルには含まれません。

### OneDrive (Entra ID)
1. Entra IDでアプリ登録を行い、**Client ID** を控えます。
2. リダイレクトURIに `http://localhost:5500`（Live Server想定）を追加します。
3. API権限で `User.Read` と `Files.ReadWrite` を許可します。
4. アプリ内の「サインイン」を押し、Client IDを入力してログインします。
5. 「OneDrive読み込み」「OneDrive保存」で `ProjectHub/projects.json` を同期できます。

**制限事項**: OneDrive同期は「添付も同期」をOFFにしている場合、メタ情報のみ保存します（添付はIndexedDBに残ります）。

### Export / Import
- Exportは2種類：
  - **メタのみ**（projects.json）
  - **添付も含める**（10MB以下の添付のみデータURLとして埋め込み）
- Importは安全のため**上書きのみ**対応です。

## 制限事項・注意
- File System Access APIは **https または localhost** でのみ動作します。
- 添付ファイルが10MBを超える場合は、メタ情報のみ保存する選択肢を出します。
- 共有PCなどではブラウザのストレージ削除に注意してください。

## トラブルシューティング
- 同期ができない: HTTPS/localhostで開いているか確認してください。
- 添付が表示されない: ブラウザのIndexedDBが削除されていないか確認してください。
- Importが失敗する: JSONが壊れていないか、UTF-8で保存されているか確認してください。
