# 変更履歴 (Changelog)

**SEED v4 Kit** に関する全ての重要な変更はここに記録されます。

## [5.1.0] - 2026-02-10
### 🎨 Hobby Ecosystem Edition
**"趣味プロジェクト循環システム"**

Project Hub v2.0 から得られた「熱量駆動」「完成→アイデア循環」「Auto-Sync UX」の知見を統合しました。

### Added
- **Hobby Project Loop**: `ops/PROMPT_LIBRARY.md` Section 4 - AI Idea Generator, Weekly Reflection プロンプト
- **Heat System**: `ops/snippets/hobby_patterns.md` - 熱量ソート、休日フィルター、Showcaseステータス
- **Auto-Sync UX**: `ops/snippets/ui_patterns/auto_sync.md` - ボタン削減、自動同期デフォルト化パターン
- **Dark Slate Theme**: `ops/snippets/ui_patterns/dark_slate.css` - プロ向けコンパクトダークテーマ
- **Hobby Mode**: `ops/WEAPON_SELECTOR.md` - 趣味プロジェクト向け装備セット
- **Case Study**: `ARCHIVED_LEARNINGS/PROJECT_HUB_CASE_STUDY.md`

## [5.0.0] - 2026-02-08
### 🧬 Evolution Protocol Edition
**"プロジェクトからの還流による、自己進化するSEED"**

Ippo Dashboard v2.0 プロジェクトから得られた「心理的安全性 (Safe AI)」「時間帯分析 (TOD)」「没入型UI」の知見をコア機能として統合しました。

### Added
- **Safe AI Prompts**: `ops/PROMPT_LIBRARY.md` に Section 3 "High-Stakes Simulation" を追加。Rubricによる内部チェックと恐怖訴求禁止を標準化。
- **Snippet Library**: `ops/snippets/` を新設。
  - `log_analysis_tod.js`: ログの時間帯統計分析ロジック。
  - `ui_patterns/glassmorphism.css`: Bento Grid対応のNeon Glassmorphismスタイル。
- **Archived Knowledge**: `ARCHIVED_LEARNINGS/IPPO_DASHBOARD_v2_CASE_STUDY.md` (Safe AI Design & Modern UI)。

### Architecture
- Directory renamed to `SEED_v5`.

## [4.1.0] - 2026-02-03
### ⚔️ Weaponized & Serverless Edition
**"プロジェクトに合わせた武器を自律選択する、拡張されたSEED"**

### Added
- **Weapon Selector**: プロジェクト開始時に `ops/WEAPON_SELECTOR.md` を通じて最適な機能セットを診断・提案する機能。
- **Manual AI Bridge**: Serverless環境でもクリップボード経由でRubric AIを利用できるアーキテクチャ。
- **Robust CSV Utils**: `ops/csv_utils.js` (RFC4180準拠) による堅牢なデータ処理。

### Architecture
- **Kickoff Update**: KICKOFF_PROMPTに「武器選定」ステップを追加。
- Directory renamed to `SEED_v4_1`.

## [4.0.0] - 2026-02-01
### 🚀 SEED v4 初版リリース
**"Intelligence & Stability Edition" (知能と安定性)**

標準搭載された機能:
- **Rubric Engine v2.0**: AI出力の品質を自動評価する内蔵エンジン (正確性, 安全性, トーン)。
- **エンタープライズ・セキュリティ**: Secure Cookies, HttpOnly, サーバーサイドセッション, CSRF対策済み。
- **本番運用の安定性**: Graceful Shutdown (安全な停止), ヘルスチェック (`/api/health`), 整合性スキャン。
- **ロール別UIテンプレート**: 標準的な役割 (PM, SV, OP) に対応した Glassmorphism ダッシュボード。
