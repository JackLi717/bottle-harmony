# 关卡生成与内容验证

千关主线新增的八级离线评价、固定分和制作配方见[千关主线与算法难度标准](production-plan.md)。生成器与命令行现支持两至十一色，颜色数加初始空瓶数最多十二；内容池上限为 1000 条。大局面求解和完整策略评级分别验证，详见[生产性能基准](production-benchmark.md)。当前应用已接入经过独立重算的一千关主线。

更新日期：2026 年 10 月 8 日。

生成器和制作工具已完成，独立于 React Native、动画和文件存储。范围是普通四层瓶、两至十一色、一至两个空瓶，总瓶数最多十二。原始四瓶体验之外，现已接入八道经过验证的多瓶校准题，D1–D4 只是试排。离线策略评价器已作为独立报告工具接入，手机读取随包调试报告。千题制作工具按人类决策代理分重新编排，当前 D1/D2/D3/D4 实际为 8/315/510/167 题，详见[连续游玩与本地进度](play-flow.md)。八道校准题保留为内部对照，每日题不在范围内。

可选备用瓶沿用双空瓶关的装水排列与末尾空瓶，不重新生成题目。最终 293 个双空瓶开局逐一移除末尾空瓶并完整求解，9 关可完成，284 关确证无解，没有预算未知；排除两道可单空瓶完成的教学，其余 7 关纳入可选备用瓶名单。新配方的缓冲关不会默认锁住备用瓶，100 个高峰按完整评级的瓶数开局。名单内单空瓶路线在测试中独立求解和回放。
## 凝固目标瓶副关卡

用户批准另外制作 50 道副关卡，每 20 道原主线后出现一题，原 1000 道题与编号不变。该结构有 `颜色数 + 1` 只瓶、恰好四格总空容量，但没有一只整瓶为空；目标瓶底层固定一层。三色题来自完整小规模状态枚举，四至六色题通过替换四层为新颜色、把被替换层移入新增瓶子的构造法扩展。候选每色仍四层，开局每瓶同色最多两层且没有已完成瓶。制作脚本 `scripts/solid-structure-research.ts --assemble-side50` 为每题独立重算冻结与融化两种状态的最短路线和不同首步后果，未知搜索结果不入库。运行包为 `assets/levels/solid-side-50.json`，载入时核对结构唯一、约束和双状态路线；`tests/solidSide.test.ts` 另外用游戏内 A* 对全部 50 道的两种状态重新求最短解。

十道三色题先让玩家认识凝固层，再按首步危险比例逐渐升温；其后十二道四色、十四道五色、十四道六色题增加瓶色与操作量。这个排序只用精确解法和首步代理量，尚未获得玩家体感校准；目标瓶题的 0–100 分不能沿用普通主线的 `human-decision-v1`。用户可随时免费融化底层，退出困难局面时没有消耗门槛。

## 生成流程

经典关卡新增独立离线特征模型 `classic-features-v1`：`npm run mainline:features` 为现有千关输出结构、参考路线、前段与收尾证据及逐关标签；`mainline:candidates` 对新候选附加 `features`。特征不改 `human-decision-v1` 分数；`mainline:replan` 使用完整证据选关，完整目录保存角色与标签，手机精简运行包不携带搜索报告。覆盖建议、观察范围、预算未知和下一轮筛选构造方案见[经典关卡特征算法与题型分布建议](level-feature-design.md)。

1. 每种颜色恰好准备四层液体，用明确的 32 位算法和 Fisher–Yates 产生候选排列，末尾加入空瓶。
2. 排除已经完成或少于两个混色瓶的候选。mixing 为 diverse 时，每个初始装水瓶至少三色、每色总量最多两层；不符合时计入 rejected.mixing，直接跳过搜索。
3. 合并结构重复题：调换瓶子、重命名颜色都视为同一结构；液体从底到顶的顺序和空瓶数量仍保留。
4. 用统一规则和预算求解器搜索。确实无解或达到单候选状态预算的题被拒绝，搜索超时则停止整个生成任务。
5. 检查参考解法的步数范围，并逐步合法回放直到整关完成。
6. 输出实际布局、生成来源、解法、结构键和基础指标。未通过以上链路的候选不作为内容输出。

不采用任意反向打乱来宣称有解。每个接纳题都由求解和回放证明可完成。基础筛选只排除明显问题，不证明有趣或适合某个难度档。

## 可重现性

算法标识为 balanced-shuffle-v1、anchored-shuffle-v1 与 layered-shuffle-v1。第一种打乱全部液体；第二种每色只留一层底色，把余下三层独立打乱，避免固定底部成对；第三种固定每瓶底部两层同色，仅保留旧来源导入能力，现行千关不再选用。三者都需要实际求解和评级。seed 是 0–4,294,967,295 的整数；每个候选由 seed、candidateIndex 和配置直接寻址，不读取全局随机数、日期或上一次任务的状态。配置记录逻辑颜色的顺序、空瓶数量、允许的参考解法步数范围及 mixing 筛选策略。mixing 默认 relaxed，diverse 至少需要三种颜色；筛选策略不改变同一候选编号的原始排列，只影响接纳哪些候选。

当前校准题按用户确认，仅 D3 思考、D4 挑战使用 diverse，D1 轻松、D2 标准保留 relaxed。千关主线另对所有档位执行统一开局筛选：任一瓶内同色最多两层（不相邻也计入），因而不能开局已有完成瓶。制作候选在求解前筛掉违规局面，完整包与手机精简包在导入时再次检查；通用生成器与旧校准题不被追溯改写。该条件只约束开局，正常游玩中的同色合并不受影响。更分散的颜色不能代替难度评价。

重编排另量化装水瓶的底部同色比例、相邻同色段和四层四色瓶数量。新混排候选必须至少有一只四层四色瓶，不能所有瓶的底两层都同色；完整千关没有全瓶底层成对的题。前段再穿插全打乱候选，避免一层底色生成器形成“底色总各不相同”的新规律。当前第 1–43 关有 120 只四层四色瓶，15 关重复底色；结构事实和首次分析的比较见最终评价。视觉筛选不代替可解性、最低策略级和决策分验收。

同一算法、seed、配置、状态预算及排除结构集合，在时间足够时选择相同内容。超过时间预算返回 limitReached，不跳过当前候选去选另一题，因此设备快慢影响成功与否，不悄悄改变成功题的选择。

内容记录同时保存实际布局和候选编号。直接重建这个候选不需要重跑之前的筛选。只保存 seed 不足以记录批量选择；状态预算和历史排除集合会影响选择，生成配置也可能在以后改变。每日题应使用已经验证并保存的实际布局，不能让各台手机临时选择候选。

关卡 ID 包括算法、seed、候选编号、颜色数和空瓶数。结构去重使用完整规范字符串，不用可能碰撞的短哈希。采用按层序分配颜色标签、仅分支等价前缀并削减已证明对称分支的规范标记；不再逐一枚举颜色的所有排列。

## 预算与失败处理

| 参数 | 默认值 | 含义 |
|---|---:|---|
| maxAttempts | 64 | 本任务最多检查的候选数，包含重复或简单候选 |
| maxStates | 30,000 | 每个候选的搜索状态上限 |
| maxTotalStates | 150,000 | 所有搜索累计状态上限 |
| maxMilliseconds | 5,000 ms | 本任务活跃执行时间，包含构造、去重、搜索和验证，排除分段之间暂停 |
| minSolutionMoves / maxSolutionMoves | 3 / 80 | 参考路径的倒水次数筛选范围 |

状态预算在下一候选搜索开始时按剩余总量收紧。达到单候选状态预算可按确定的次序尝试下一候选；达到总状态或总时间预算时停止。取消会释放当前搜索并保留统计。当前没有独立的精确字节内存预算，也不保证垃圾回收期间严格遵守目标切片时长。

结果区分 generated、exhausted、limitReached 和 invalid。exhausted 表示指定候选预算用尽，不能解释为不存在符合条件的关卡。失败结果不含可游玩的候选，也不提供未经验证的兜底题。未来手机模式失败时应取已验证备用池。

createGenerator 提供 step 和 cancel，可分段调度；generateContent 是 Node 制作工具的同步包装。手机端实际生成尚未接入，性能仍需在 Release 真机上验证。暂时没有 C++ 实现。

## 内容记录和验证

GeneratedContent 包括格式版本、来源、实际 LevelDefinition、完整参考解法、精确结构键和基础指标。指标为颜色数、瓶数、混色瓶数、颜色段数、参考路径步数，不含难度分数或 D1–D4 标签。

当前生成器在五色以内默认使用 BFS，更大局面默认使用具有可采纳下界的 A*；两者在完整成功时证明最短参考路线，但导入文件只声明和验证合法完整解法，不凭文件内的声明证明最短性。未来难度评价如果需要最短距离，应重新求解或使用受控制作流程的求解结果；不能把被改长的导入路径当作难题。

内容池格式为 bottle-harmony-pool、version 1、records 数组，限 1–1000 条与 32,000,000 个 JSON 字符。导入每条记录时重新构造来源对应的候选、核对实际布局和 mixing 条件、逐步回放、重算指标与结构键，并检查全池重复和 ID 冲突。未知字段、未知算法、缺失解法、非法动作和不匹配元数据均拒绝。校准题载入还要求 D3、D4 明确采用 diverse 策略。

记录不保存本机耗时和运行时间戳，成功内容的序列化可以完全一致；运行诊断通过工具输出，包含候选数、访问状态数和活跃耗时。格式仍只有当前预发布基线，不增加旧版本迁移。

## 制作命令

千关主线的离线制作工具按如下顺序使用。候选文件和中间目录均留在 `builds/`；每条候选先经过求解、完整策略评价和人类决策代理评价。重编排读取已有完整目录及候选文件，随后由 `mainline:build` 和 `mainline:verify` 分别重建来源、独立复算证据。单瓶备用资格须在最终目录上重新求解，只有 `unknown=0` 的审计才能生成名单。

```sh
npm run mainline:candidates -- 40 6 2 1000000 builds/anchored-6.json
npm run mainline:candidates -- 120 5 2 1100000 builds/balanced-5.json balanced-shuffle-v1
npm run mainline:replan -- assets/levels/mainline-catalog.json builds/replanned.json builds/anchored-6.json
npm run mainline:opening-mix -- builds/replanned.json builds/mixed.json builds/balanced-5.json
npm run mainline:build -- --input builds/mixed.json --output builds/rebuilt.json
npm run mainline:verify -- --input builds/rebuilt.json --output builds/rebuilt-play.json
npm run mainline:reserves -- builds/rebuilt.json builds/optional-reserve-audit.json
```

上面的候选批量数字只示意参数；完整重编排需提供足够多的已评级、结构互异的候选，才能满足 1000 个位置和挑战分数坡度。`mainline:opening-mix` 只把同代理分的全打乱题分散放入前 100 关。`mainline:replace` 接受“完整目录、单条候选文件、关号、输出目录”四个位置参数，只在候选代理分与该关现有分数相同且全部目录约束通过时替换。生成的备用瓶 TypeScript 文件先写成同名 `.ts.txt`，经审计后复制到 `src/game/optionalReserve.ts`。

```sh
npm run levels:generate -- --seed 717 --colors 3 --count 10 --output builds/levels.json
npm run levels:generate -- --seed 1000001 --colors 6 --count 1 --generator anchored-shuffle-v1 --output builds/anchored-levels.json
npm run levels:generate -- --seed 717 --colors 4 --count 1 --empty-bottles 1 --mixing diverse --min-moves 14 --max-attempts 1000 --output builds/diverse-levels.json
npm run levels:verify -- --input builds/levels.json
npm run levels:generate -- --help
```

批量第 i 条从 (seed + i) 按 32 位整数回绕，排除已经接纳的结构。全部生成完成并通过序列化文件验证后，才原子替换输出；失败不会留下半个内容池，也不会覆盖原有输出。相同输入成功运行可生成完全相同的文件。

可调整空瓶数、解法长度范围、候选和搜索预算。两色四层的结构空间有限，要求过多不重复内容可能失败；工具不会通过只换颜色伪装新题，也不承诺永远没有重复。

默认输出位于被 Git 忽略的 builds/。本轮实跑 seed 717、两至五色各 10 条，共 40 条，并重新导入验证全部通过：

| 颜色数 | 本地文件 | 样例参考步数范围 | 总候选数 |
|---|---|---:|---:|
| 2 | builds/levels-2-colors.json | 3–5 | 12 |
| 3 | builds/levels-3-colors.json | 5–9 | 10 |
| 4 | builds/levels-4-colors.json | 9–14 | 10 |
| 5 | builds/levels-5-colors.json | 12–16 | 10 |

另已生成并验证混合的 40 条内容池 builds/levels-validation-pool.json。这些是制作验证样本，尚未人工评级，完整池不进入应用包。当前八道校准题存入 assets/levels/calibration.json，仅用于标注为试排的内测；D3、D4 的开局按 diverse 筛选，C05、C07、C08 更新候选，C06 保留符合条件的布局，全部重新验证。竞品素材仍保存在另一个被 Git 忽略的 docs/references/ 目录。

## 验证与下一阶段

37 项测试包括核心、生成工具和校准试玩。生成测试覆盖稳定排列、边界 seed、不同切片顺序下的成功内容一致、两至五色完整回放、输入隔离、颜色/瓶位去重、无解/简单/步数/混排筛选、资源预算、取消、内容篡改和命令行实际文件验证。diverse 另检查三至五色的确定性生成和导入拒绝不合规开局。命令行测试也验证失败不覆盖已有内容、重复运行文件完全一致；校准题另检查重新求解、会话回放、参考解法匹配、多瓶布局和倒水几何。

当前千题主线使用[人类决策代理模型](production-plan.md)编排，旧八级规划报告仍保存为内部对照。颜色数、解法步数和搜索速度都不能单独等同于体感难度；代理分还需真实玩家校准。

离线评价器、分级候选、批量断点制作与独立重算均已实现。手机只读取固定关卡和离线报告，不即时生成；下一步量化提示、渲染和存储表现，再判断是否需要原生优化。

## 离线难度报告

```sh
# 八题加原始体验；先全部评级成功，再写入随包文件
npm run levels:rate -- --include-demo --require-rated --output assets/levels/calibration-difficulty.json
# 重新求解、重评、比较全部证据，不写文件
npm run levels:rate -- --include-demo --require-rated --verify assets/levels/calibration-difficulty.json
# 普通制作内容；报告默认留在本机
npm run levels:rate -- --input builds/content-pool.json
```

`--max-states` 控制完整求解状态上限（默认 100000），`--max-work` 控制策略工作预算（默认 1000000），`--max-ms` 控制每题总耗时（默认 30000）。低层超限输出 unknown，无档位；穷尽无解输出 unsolvable，无难度档。`--require-rated` 在有任何未评级题时失败，保留旧文件；成功写入采用临时文件替换，拒绝覆盖输入关卡。

报告是独立 sidecar，不改变关卡 JSON、seed 或人工试排分组。包含方法版本、结构键、自动档位、各策略证据和参考路径指标；手机加载检查实际布局和路线，不执行完整策略评价。修改规则、关卡或评价方法后必须重新计算并核查随包报告。方法详见[校准记录](difficulty-calibration.md)。
