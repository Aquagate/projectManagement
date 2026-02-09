# SEED v4: Generic AI-Driven Development Kit
**Version**: 4.0.0 (Code-name: Self-Correcting Intelligence)
**Concept**: "AI-Augmented Adaptive Framework with Quality Assurance"

## 🌟 概要 (Concept)
SEEDは、あらゆるプロジェクト開発の「始点」となるAI駆動開発プラットフォームです。
v4では、v3までの「人間とAIの協働」に加え、**「AIがAIを評価・修正する自己浄化作用（Rubric Engine）」**と**「エンタープライズ級の堅牢性」**を標準搭載しました。

### ✨ 本キットが提供する「標準価値」 (The 5 Pillars)
どんなプロダクトを作る場合でも、以下の5要素が強力な武器となります。

1.  **Rubric Engine (AI品質保証)** <span style="color:red">[v4 New]</span>
    *   生成されたAI回答を「雰囲気」ではなく**「数値」**で管理します。
    *   **Groundedness (正確性)**, **Safety (安全性)**, **Tone (態度)** の3次元で自動採点し、品質を担保します。

2.  **AI Knowledge Loop (自己進化エンジン)**
    *   ユーザーの非定型な振る舞いを検知し、システムが自ら「機能」や「ルール」を提案する仕組み。
    *   v4では、この提案プロセス自体もRubric Engineによって事前審査されます。

3.  **Enterprise Security (堅牢な守り)** <span style="color:red">[v4 New]</span>
    *   **Secure by Default**: `HttpOnly` Cookie, `Strict` CSRF対策, サーバーサイドセッションを標準化。
    *   開発初日から「本番品質」のセキュリティを提供します。

4.  **Behavioral Nudge UI (行動デザイン)**
    *   ユーザーを自然に「望ましい行動」へ誘導するUIコンポーネント集。
    *   v4では、全ての通知系UIが `utils.js` (Toast) に統一されました。

5.  **Hybrid Intelligence (ハイブリッド知能)**
    *   **High-End Dev (Gemini)**: 複雑な推論と創造を担当。
    *   **Local Guardian (Ollama + Rubric)**: 安全性と整合性のチェックを担当。相互監視によりハルシネーションを防ぎます。

## 🏗️ 技術標準 (Technical Standards)
*   **AI Core**: **Dual-Tier AI** + **Analytic Judge** (評価用AIの導入).
*   **Backend**: Node.js (Security Hardened with Graceful Shutdown).
*   **Data**: JSON-based storage with integrity protection.

## 📂 ディレクトリ構成 (SEED v4)
```
SEED_v4/
├── public/          # フロントエンド
│   ├── js/utils.js         # v4: 統一エラーハンドリング & ログアウト
│   └── (dashboards...)     # ロール別テンプレート (Request, OP, SV, PM)
├── ops/             # ロジック & AIコア
│   ├── rubric_engine.js    # v4: 品質評価エンジン (★Core)
│   ├── server.js           # v4: セキュリティ強化版サーバー
│   └── analyze_patterns.js # Rubric統合済み分析エンジン
├── data/            # データストア (自動バックアップ対応)
└── docs/            # マニュアル類
```

## 🛠 使い方 (How to Use)
1.  **Define**: 何を作るか決める。
2.  **Rubric (v4)**: `docs/spec/RUBRIC_ALGORITHM.md` を参考に、プロジェクトの「品質基準」を定義する。
3.  **Map**: SEEDのロール（User, Op, SV, PM）を自分のプロダクトにマッピングする。
4.  **Develop**: `public/` 内のHTMLをベースに画面を作り変える。
5.  **Evolve**: 運用しながら Rubric Score を監視し、AIのプロンプトを磨き込む。

## 👥 標準チーム編成 (Standard Formation)
SEEDは、機能ごとの役割分担を明確にした「6つの機能（Hexagon）」での運用を前提としています。
*   **AXIS**: Decide (意思決定)
*   **FRAME**: Report (報告・管理)
*   **FORGE**: Build (実装・開発)
*   **PROBE**: Measure (品質・AIスコア計測) <span style="color:red">[v4 Updated]</span>
*   **LEDGER**: Organize (ルール整理)
*   **DELIVER**: Operate (運用・デリバリー)

---

## 📚 Appendix: Self-Correcting Intelligence (自己修正の哲学)

v4における最大の進化は、AIが**「作りっぱなし」でなくなること**です。

### Rubric Driven Development (RDD)
1.  **Generate**: AI (High-Entropy) が回答を生成する。
2.  **Evaluate**: 別のAI (Low-Entropy Judge) が Rubric に基づき冷徹に採点する。
3.  **Gate**: スコアが基準（例: 95点）未満なら、ユーザーに出す前に棄却あるいは再生成する。

このループを標準で組み込むことで、SEED v4 で作られたアプリは**「運用するほどに賢く、行儀良くなる」**という特性を持ちます。

---
**Powered by Antigravity Agent & SEED Ecosystem**
