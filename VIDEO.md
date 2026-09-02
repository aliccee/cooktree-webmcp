# CookTree — 3 分钟录屏稿

**规则**：3 分钟以内 · 必须有音频 · 传 YouTube 公开 · **不要背景音乐** · 不能出现第三方商标（Shopify 的名字出现在你自己的界面里是集成说明，没问题；不要放别家的 logo）· 不用露脸。

**录之前**
1. Chrome 开 WebMCP flag，确认右上角是绿的 `WebMCP connected · 13 tools`
2. 无痕窗口打开线上地址（避免缓存）
3. 先点 `LOAD DEMO KITCHEN`，然后 **把 console 折叠成 `user view`**
4. 先掐表念一遍，超时再删句子——不要边录边改

〔〕= 屏幕动作，不用念。

---

## 0:00 – 0:22 　两个选项

〔干净的页面，console 收起〕

> To let an AI act for you on a website, you have two options.
>
> Hand it your browser — it inherits your whole logged-in session. Every page,
> every saved card.
>
> Or issue it a token — it outlives the session and you can't take it back.
>
> **There is no third option that says "just a little bit."**

## 0:22 – 0:32 　命名

> That third option is what WebMCP adds. A site declares the functions it is
> willing to hand over. This one declares thirteen.

〔指一下右上角绿色的 `WebMCP connected · 13 tools`〕

## 0:32 – 1:05 　排一周的菜

> Watch. I'll ask for a week of dinners.

〔在 console 输入框打：`I have tofu and beef. Plan three dinners under 45 minutes.`〕

〔树长出来，购物清单出现〕

> **Twenty-one ingredient requests collapse into sixteen ingredients, and eight
> things to actually buy — forty-one ten.**
>
> Five dishes want garlic. The list says one head — deduped, minus what I
> already have, rounded to the size garlic is sold in.
>
> **None of that math is on the page. There's nothing here to scrape.**

## 1:05 – 1:25 　生成一道它没听过的菜

〔在顶部输入框打中文：`卤肉饭`，点 GENERATE〕

> This dish isn't in the catalog. And I'm asking in Chinese.

〔卡片出现：Braised Pork Rice · 卤肉饭 · TAIWANESE · AI，带生成的照片〕

> Real quantities, a generated photograph, planned through the same engine.
>
> And the site checks those quantities against its own pack sizes. Ask for three
> grams of onion, and it knows an onion is a two-hundred gram pack — it fixes it
> and says so. **The model is a source, not an authority.**

## 1:25 – 1:50 　它做不到的事 ★最关键

> Now the part that matters.

〔输入：`Change my delivery address to 42 Mission St.`〕

〔console 打出红色的 `✕ no such tool`，右上角 ACCOUNT 里 DELIVERY ADDRESS 那行闪红〕

> It can't.
>
> Not blocked, not password-protected — **the site never registered that
> function.** Thirteen exist; this isn't one.
>
> The account panel shows what CookTree does hold. **None of it is a tool.**
>
> A browser agent in this same tab would just open Settings and change it —
> because what it got was my whole session.

## 1:50 – 2:20 　结账：交接，不是支付

〔点 CHECK OUT〕

> And when it reaches outside, the **site** renders this — not the agent.

〔确认层弹出，停一拍〕

> The call is blocked until a person clicks. Confirm, and CookTree sends names
> and quantities to the Shopify catalog and gets back real carts.
>
> **Then it stops. I pay on the merchant's own page.**
>
> No card, no address, no merchant session here. That's not an unfinished edge —
> **taking payment would mean holding a card**, the exact thing this argument
> says a site shouldn't have to hand over.

## 2:20 – 2:45 　实现

〔点右下角 `developer view`，展开 console，刚才的日志全在〕

> Everything you just saw is in here.
>
> Thirteen tools, defined once, each registered with
> `document.modelContext.registerTool`.
>
> **The site's own buttons call the same function the agent calls** — so there's
> no second path that can drift.
>
> One static HTML file, plus two serverless functions holding the provider keys.

## 2:45 – 3:00 　收尾

> Honest boundary: this is least privilege, not a security perimeter. An agent
> with DOM access can go around it.
>
> The point is that a cooperating agent **never needs that access** —
>
> **and the site, for the first time, gets to choose.**

---

## 时长预算

| 段 | 秒 | 内容 |
|---|---|---|
| 1 | 22 | 两个选项 |
| 2 | 10 | WebMCP · 13 tools |
| 3 | 33 | 排菜单 + 合并数字 |
| 4 | 20 | 生成菜谱 + 数量校验 |
| 5 | 25 | **被拒绝** |
| 6 | 30 | 结账交接 |
| 7 | 25 | 实现 |
| 8 | 15 | 收尾 |
| | **180** | |

**超时先砍第 4 段的后半句**（数量校验那两句），它最好听但不是必需。**第 5 段一个字都别砍。**

## 万一出事

| 情况 | 怎么说 |
|---|---|
| 灯是灰的 | "The registration is real — this browser just doesn't have the flag on. The built-in agent drives the identical thirteen tools." |
| GENERATE 失败 | 跳过第 4 段，直接进第 5 段。**别在镜头前重试。** |
| Shopify 失败 | 界面本来就会打印一句清楚的错误。念："It tells you exactly what failed, and nothing was charged." 然后继续 |
