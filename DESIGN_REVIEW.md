# Design Review

<!-- repository-creator:managed:start -->

## Role

完成済みのユーザー向け成果物を、実装時とは独立した視点でレビューする。

主目的は、AI生成物にありがちな平均的・テンプレート的な構成、理由のない装飾、プロダクト固有性の不足、状態不足、レスポンシブの弱さなどを実画面から発見し、本当に必要な部分だけ改善すること。

このレビューでは既存実装を擁護しない。一方で、変更すること自体も目的にしない。

## Review Principle

コードが動くことと、プロダクトとして良いUIであることを分けて評価する。

レビューでは、実装者が何を意図したかより、ユーザーが実際に何を見るか、何を理解するか、何を操作できるかを優先する。

AIらしさは、紫色、角丸、カードなど一つの記号だけで判定しない。

**複数の頻出デフォルトが理由なく重なり、さらにプロダクト固有の判断が弱い状態**を重点的に検出する。

## Review Process

1. `DESIGN.md` と、存在する場合はプロジェクト固有の参考元・デザイン判断を読む。
2. 最初のレビューではコードを変更しない。
3. 実際の成果物をレンダリングし、今回のプロダクトに必要なDesktop / Mobile幅を確認する。
4. 主要フローだけでなく、変更内容に関係するloading、empty、error、長いテキスト、少量 / 大量データなど現実的な状態も必要に応じて確認する。
5. コードではなく、ユーザーが実際に見る画面、情報階層、操作、状態を中心に評価する。
6. 問題候補を列挙する。
7. 各問題を影響度と構造性で優先順位付けする。
8. 影響の大きいものだけを選び修正する。
9. 再レンダリングし、同じ幅・状態・観点で確認する。
10. 修正によって別の領域へ新しい問題を作っていないか確認する。

## Review Order

AIっぽさや完成度不足を感じた場合、原則として次の順で原因を探す。

1. Product fit / user job
2. Information architecture
3. Macrostructure / composition
4. Hierarchy / primary action
5. Layout / alignment / density
6. Typography
7. Component choice
8. Spacing / sizing
9. Color / border / radius / shadow
10. Decoration / motion

上位の問題を、色変更、角丸変更、影追加など下位の調整だけで解決したことにしない。

## Review Criteria

### 1. Product Specificity

- このプロダクト固有の目的、内容、利用者、主要タスクがデザインに反映されているか。
- 主要画面の重心が、このプロダクトで最も重要な対象へ向いているか。
- 汎用Dashboard、汎用SaaS、汎用Landing pageの型へ内容を押し込んでいないか。
- プロダクト名と色だけを変えれば、他の無関係なサービスにも使えるgenericな構成になっていないか。

### 2. Content-Driven Composition

- 各セクションが実際の内容または操作上の必要から存在しているか。
- 3つに分ける理由がないものを3カードにしていないか。
- Dashboardという理由だけでmetric cardsを並べていないか。
- Landing pageという理由だけでHero、Feature grid、Testimonials、Pricing、FAQ、CTAを順番に置いていないか。
- 実コンテンツの長さ、偏り、重要度が構成へ反映されているか。

### 3. Composition and Hierarchy

- 明確な視覚的焦点と自然な視線の流れがあるか。
- 主要タスクと主要アクションが迷わず見つかるか。
- 補助ナビゲーションや副次情報が、主作業領域と同じ強さで競合していないか。
- 情報の重要度が、サイズ、位置、余白、密度、コントラスト、タイポグラフィに反映されているか。
- 不要なカード、コンテナ、均一なグリッド、機械的な対称配置へ逃げていないか。
- 内容ではなく既成テンプレートの都合で画面構成が決まっていないか。
- 画面全体が同じ密度・同じ余白・同じ視覚重量になっていないか。

### 4. Typography

- 見出し、本文、ラベル、補助情報、数値などの役割が視覚的に区別できるか。
- 大きすぎるHero見出しだけに階層を依存していないか。
- フォント、ウェイト、行間、字間が役割に応じて一貫しているか。
- 選択した書体が、単にAI生成UIで頻出するデフォルトだから残っている状態ではないか。
- 日本語など対象言語で文字密度、改行、可読性が自然か。

### 5. Color and Surface

- アクセント色が意味を持って使われているか。
- gradient、glow、glassmorphism、blurなどが、画面を“それらしく”見せるためだけに使われていないか。
- 色だけで状態を伝えていないか。
- border、surface、shadowが階層やグルーピングを助けているか。
- 平面で十分な関係を、理由なく浮遊カードにしていないか。

### 6. Shape and Component Language

- radius、border、shadow、button shapeに一貫したルールがあるか。
- ほぼすべての部品を同じ大きな角丸へしていないか。
- pill型button、badge、eyebrow labelを意味なく多用していないか。
- コンポーネントライブラリの初期見た目がそのままプロダクト全体の人格になっていないか。
- 同じ意味の部品が画面ごとに別の見た目や操作になっていないか。

### 7. Icons and Imagery

- iconが認識、操作、状態理解を実際に助けているか。
- Sparkles、Rocket、Shield、Zapなどの汎用iconを雰囲気作りのためだけに並べていないか。
- iconと同じ意味のテキストを不必要に重複していないか。
- 画像・図版・イラストに、このプロダクト固有の役割があるか。

### 8. Motion and Interaction

- motionが状態変化、空間関係、操作結果の理解を助けているか。
- すべてのカードがhoverで浮く、すべての要素へ同じtransformが付くなど機械的な動きになっていないか。
- animationが主要操作より目立っていないか。
- `prefers-reduced-motion` など利用者設定を尊重しているか。

### 9. UI / UX

- 主要操作が迷わず理解できるか。
- navigationとactionが視覚・挙動の両面で区別されているか。
- 操作対象、範囲、結果が重要操作ほど明確か。
- advancedな操作がdefault pathを不必要に複雑にしていないか。
- stateや操作結果が適切に伝わるか。
- validation後も入力内容を失わず回復できるか。
- destructive actionの危険度と確認方法が影響に見合っているか。

### 10. Responsive Design

- MobileがDesktopの単純な縮小・縦積みになっていないか。
- 画面サイズに応じて情報優先順位、密度、操作方法が適切に再構成されているか。
- Desktopの横並び要素が、Mobileで意味のある順序になっているか。
- 主要操作が長いスクロールの末尾へ追いやられていないか。
- hoverだけに操作や情報が依存していないか。
- overflow、届かない操作、不自然な固定要素、keyboard表示時の破綻、過剰なスクロールなどがないか。

### 11. Resilience

必要な範囲で次の状態を確認する。

- loading
- empty
- sparse data
- populated data
- large values
- long text
- validation
- error
- permission denied
- disabled
- stale / optimistic state
- narrow width

すべての画面ですべてを網羅する必要はない。現在の機能で実際に起こりうる重要状態を対象にする。

### 12. Accessibility

- keyboardだけでも主要操作へ到達できるか。
- focusが視認できるか。
- touch targetが実用的か。
- contrastが実利用に十分か。
- icon-only actionなどにaccessible nameがあるか。
- 状態や意味を色だけに依存していないか。
- Design Systemのcomponentを使用しているだけでAccessibility確認済みと判断していないか。

### 13. Evidence and Copy

- 実在しない利用者数、導入企業、testimonial、評価、性能、security claimなどが装飾目的で置かれていないか。
- 「Seamless」「Powerful」「Supercharge」「Unlock」など、具体的内容を伝えないgenericな宣伝文句がUIの空白を埋めていないか。
- 内部ツールや実用アプリへMarketing copyが入り込み、操作理解を邪魔していないか。

文言そのものの品質判断は `CONTENT.md` の責務とし、ここでは画面構成やAI生成感へ影響する範囲を見る。

### 14. References

参考元がある場合は、表面的な類似度ではなく、記録されたデザイン判断が成果物へ適切に反映されているかを見る。

- 参考元の何を学ぶべきだったか。
- その原則が現在の成果物に反映されているか。
- 反映しない判断に妥当な理由があるか。
- 機能だけを参考にして、肝心のデザイン判断が抜け落ちていないか。
- 参考元の特徴をコピーしただけで、このプロダクトには不自然になっていないか。

## AI-Default Cluster Scan

主要画面ごとに、次の頻出パターンが理由なく集中していないか確認する。

- centered hero + abstract subtitle + dual CTA
- equal 3 / 4 card feature grid
- generic bento grid
- excessive cardification
- oversized rounded containers
- pill buttons / pill badges / eyebrow labels everywhere
- purple / blue gradient, aurora, glow, glass as generic tech styling
- gradient headline
- decorative generic icons
- generic fake metrics / testimonials
- hover lift on every card
- excessive transform / animation
- default component-library appearance
- identical visual rhythm across all sections
- Mobile as simple one-column stacking

一つだけなら即座に問題としない。

**同じ主要画面に3つ以上が集中し、それぞれにプロダクト固有の理由を説明できず、Genericness Testsでも失敗する場合は、部分的なpolishではなく構造再検討を優先する。**

## Genericness Tests

### Logo Swap Test

> プロダクト名、ロゴ、アクセントカラーを変更しただけで、この画面を複数の無関係なサービスにもそのまま使えそうか。

Yesなら、どの構成・階層・表現・判断がgenericなのか具体的に特定する。

### Screenshot Silhouette Test

文字を細かく読まず、画面の大きな矩形、余白、強弱、重心だけを見る。

典型的なAI SaaSやtemplateのmacrostructureとほぼ同じ場合は、paletteではなくlayout / compositionを問題候補にする。

### Purpose Test

主要なcard、container、badge、gradient、shadow、motion、illustrationについて次を問う。

> これがなくなると、情報理解・操作・状態・ブランド表現の何が悪化するか。

具体的に答えられなければ、削除・統合・別表現を検討する。

### First-Default Test

> この構成は、このプロダクトだから選ばれたのか。それともAIが同じ依頼を受けたとき最初に出しやすい構成だから残っているのか。

後者の可能性が高い場合、少なくとも一つ構造的に異なる方向と比較してから維持するか決める。

## Findings

「なんとなくAIっぽい」「もっと洗練できる」だけでは問題として扱わない。

各指摘は可能な限り次の順で説明する。

**Visible evidence → User / product impact → Why it reads as generic or weak → Design principle → Concrete fix**

### Severity

- `P0`: 主要タスクを阻害する、重大なAccessibility問題、誤操作や回復不能な問題を生む
- `P1`: 情報階層、主要フロー、レスポンシブ、プロダクト固有性など完成度を大きく下げる
- `P2`: 明確に改善価値はあるが、主要体験を大きく損なわない
- `P3`: 好みまたは微細なpolish。原則として変更理由にしない

- 最大8件までとし、影響が大きい順に並べる。
- P0 / P1を優先する。
- 表面的な変更より構造的な変更を優先する。
- 同じ根本原因から生じる複数の症状は、一つの問題としてまとめる。

## Repair Rules

- 既に良い部分は残す。
- Anti-slopを理由に、無味無臭、過剰にミニマル、個性のないデザインへ変更しない。
- 特定の色、font、radius、layoutを機械的に禁止しない。
- 参考元のコピーを目的にしない。
- P0 / P1の構造問題がある場合、装飾polishから始めない。
- 問題がclusterとして発生している場合、一個ずつ表面修正するより共通する構造原因を直す。
- 修正後は実画面を再確認する。
- 修正前と同じwidth / stateで比較する。
- 重大な問題が解消されていれば終了し、P3の好みだけを理由に無限に変更を繰り返さない。

## Delivery Gate

次を満たした場合にデザインレビューを完了できる。

- 未解決のP0がない
- 採用すべきP1を修正済み、または変更しない具体的理由がある
- 主要画面がGenericness Testsで重大な失敗をしていない
- AI-Default Cluster Scanで構造再検討が必要なclusterを残していない
- 主要タスクと主要アクションが明確
- 必要なDesktop / Mobile表示を確認済み
- 今回の変更に関係する重要状態を確認済み
- 修正後の実画面を再確認済み

「cleanになった」「modernになった」「AIっぽさが減った」という感想だけでPASSにしない。具体的な画面上の根拠を持って完了判定する。

## Workflow Handoff

この `Delivery Gate` を通過したことは、プロダクト全体の作業完了を意味しない。

- デザインレビューと必要な修正が終わったら、必ず `WORKFLOW.md` のプロダクト全体再評価へ戻る。
- この文書単独ではタスクの最終完了を判断しない。
- Desktop / Mobileの確認、Visual QA、Genericness Tests、Delivery GateのPASSだけを理由に最終報告して終了してはならない。
- デザインレビューで機能・コンテンツ・主要フローなど他領域の問題が見つかった場合は、それを全体再評価の候補へ戻す。
- `WORKFLOW.md` の全体再評価で新たに1件以上の改善が `採用` された場合、タスクは未完了であり、そのまま次の実装・検証・再評価へ進む。
- 最終的な継続・終了判定は `WORKFLOW.md` の終了条件に従う。

<!-- repository-creator:managed:end -->
