// ============================================================
// 50 Chinese search queries with ground truth
// Used for: CJK n-gram vs baseline search precision benchmark
// ============================================================
import type { SearchQuery, SearchNote } from "../types";

/** Simulated vault of 30 notes in various categories */
export const VAULT_NOTES: SearchNote[] = [
  { title: "深度学习基础", content: "深度学习是机器学习的一个子领域，使用多层神经网络从数据中学习表示。关键概念包括反向传播、梯度下降、激活函数等。常用的框架有 PyTorch、TensorFlow。", tags: ["深度学习", "AI"] },
  { title: "卷积神经网络详解", content: "CNN 是计算机视觉中最常用的架构。包含卷积层、池化层和全连接层。卷积核在输入上滑动提取特征。经典架构包括 LeNet、AlexNet、VGG、ResNet。", tags: ["CNN", "计算机视觉"] },
  { title: "Transformer架构分析", content: "Transformer 基于自注意力机制，完全抛弃了循环结构。核心组件：多头注意力、位置编码、前馈网络。BERT 和 GPT 都基于 Transformer。", tags: ["Transformer", "NLP"] },
  { title: "自然语言处理入门", content: "NLP 是 AI 的重要分支，研究计算机与人类语言的交互。包括分词、词性标注、命名实体识别、情感分析等任务。近年来预训练语言模型大幅提升了 NLP 性能。", tags: ["NLP", "入门"] },
  { title: "Python编程笔记", content: "Python 是一种解释型、面向对象的高级编程语言。语法简洁，拥有丰富的标准库和第三方库。广泛应用于数据科学、Web 开发、自动化运维等领域。", tags: ["Python", "编程"] },
  { title: "知识图谱构建方法", content: "知识图谱以图结构表示实体及其关系。构建步骤：实体识别、关系抽取、实体链接、图谱补全。常用工具：Neo4j、Apache Jena。应用：搜索引擎、推荐系统、问答系统。", tags: ["知识图谱", "数据"] },
  { title: "Git版本控制入门", content: "Git 是分布式版本控制系统。基本操作：git init、git add、git commit、git push、git pull。分支管理：git branch、git merge。远程仓库：GitHub、GitLab。", tags: ["Git", "工具"] },
  { title: "Linux常用命令", content: "Linux 命令行基础：ls、cd、pwd、mkdir、rm、cp、mv。文本处理：grep、sed、awk。权限管理：chmod、chown。进程管理：ps、top、kill。", tags: ["Linux", "工具"] },
  { title: "数据库SQL基础", content: "SQL 是关系数据库的标准查询语言。DDL：CREATE、ALTER、DROP。DML：SELECT、INSERT、UPDATE、DELETE。JOIN 类型：INNER、LEFT、RIGHT、FULL。", tags: ["数据库", "SQL"] },
  { title: "强化学习原理", content: "强化学习通过智能体与环境交互来学习最优策略。核心要素：状态、动作、奖励。算法：Q-Learning、SARSA、Policy Gradient、DQN、PPO。", tags: ["强化学习", "AI"] },
  { title: "注意力机制详解", content: "注意力机制允许模型在处理序列时聚焦于重要部分。Scaled Dot-Product Attention、Multi-Head Attention、Cross Attention。在机器翻译、图像描述等任务中广泛使用。", tags: ["注意力", "NLP"] },
  { title: "GAN生成对抗网络", content: "GAN 由生成器和判别器组成，通过对抗训练生成逼真数据。变体：DCGAN、CycleGAN、StyleGAN。应用：图像生成、风格迁移、数据增强。", tags: ["GAN", "生成模型"] },
  { title: "图神经网络GNN", content: "GNN 处理图结构数据。消息传递框架：聚合邻居信息→更新节点表示。类型：GCN、GAT、GraphSAGE。应用：分子预测、社交网络分析、推荐系统。", tags: ["GNN", "图学习"] },
  { title: "模型评估与验证", content: "机器学习模型评估指标：准确率、精确率、召回率、F1-Score、AUC-ROC。交叉验证：K-Fold、Stratified K-Fold。混淆矩阵分析。", tags: ["评估", "ML"] },
  { title: "数据预处理技术", content: "数据清洗：缺失值处理、异常值检测。特征工程：标准化、归一化、独热编码、特征选择。数据增强：图像翻转/旋转、文本回译。", tags: ["数据", "预处理"] },
  { title: "BERT预训练模型", content: "BERT 通过掩码语言模型和下一句预测进行预训练。Bidirectional Transformer。在 11 个 NLP 任务上达到 SOTA。Fine-tuning 策略。", tags: ["BERT", "NLP", "预训练"] },
  { title: "YOLO目标检测", content: "YOLO 将目标检测视为回归问题，一次前向传播即可输出 bounding boxes 和类别概率。版本演进：YOLOv1-v8。速度与精度的平衡。", tags: ["YOLO", "目标检测"] },
  { title: "Docker容器技术", content: "Docker 提供轻量级容器化方案。核心概念：镜像、容器、仓库。Dockerfile 编写、docker-compose 多容器编排。与虚拟机的对比。", tags: ["Docker", "DevOps"] },
  { title: "概率论基础", content: "概率论基本概念：样本空间、事件、条件概率、贝叶斯定理。随机变量与分布：二项分布、正态分布、泊松分布。期望、方差。", tags: ["数学", "概率"] },
  { title: "线性代数复习", content: "矩阵运算、特征值与特征向量、奇异值分解 SVD、主成分分析 PCA。在机器学习中用于降维、推荐系统等。", tags: ["数学", "线性代数"] },
  { title: "微积分要点", content: "导数、偏导数、梯度、链式法则。梯度下降的数学原理。在深度学习反向传播中的应用。", tags: ["数学", "微积分"] },
  { title: "大模型LLM综述", content: "大型语言模型的发展：GPT系列、LLaMA、Claude、DeepSeek、ChatGLM。关键技术：RLHF、指令微调、思维链推理。能力涌现现象。", tags: ["LLM", "大模型"] },
  { title: "Prompt工程实践", content: "Prompt Engineering 技术：零样本、少样本、思维链、Self-Consistency、ReAct。结构化输出。System Prompt 设计原则。", tags: ["Prompt", "LLM"] },
  { title: "RAG检索增强生成", content: "RAG 结合检索和生成：向量数据库存储文档→用户提问→检索相关文档→注入上下文→LLM生成回答。Chunk 策略、检索优化。", tags: ["RAG", "LLM"] },
  { title: "Agent智能体架构", content: "AI Agent 通过工具调用与环境交互。ReAct 模式：思考→行动→观察→思考循环。多 Agent 协作：角色分工、消息传递。应用：代码生成、数据分析。", tags: ["Agent", "LLM"] },
  { title: "Docker部署深度学习项目", content: "使用 Docker 封装深度学习项目：CUDA 支持、Python 依赖管理、模型文件挂载。docker-compose.yml 配置。镜像优化：多阶段构建。", tags: ["Docker", "部署"] },
  { title: "PyTorch框架入门", content: "PyTorch 核心概念：Tensor、Autograd、nn.Module、DataLoader。训练循环：前向传播→计算损失→反向传播→参数更新。GPU 加速。", tags: ["PyTorch", "框架"] },
  { title: "计算机视觉基础", content: "计算机视觉任务：图像分类、目标检测、语义分割、实例分割。传统方法：SIFT、HOG。深度学习方法：CNN、ViT。", tags: ["计算机视觉", "CV"] },
  { title: "机器学习数学基础", content: "机器学习的数学基础包括线性代数（矩阵分解）、概率论（贝叶斯）、微积分（梯度优化）、信息论（熵、KL散度）。", tags: ["数学", "ML"] },
  { title: "Zettelkasten笔记方法", content: "Zettelkasten 卡片盒笔记法：原子化笔记、双向链接、渐进式发展。核心原则：每张卡片一个概念，用链接编织知识网络。与 PARA 方法的对比。", tags: ["笔记方法", "效率"] },
];

export const SEARCH_QUERIES: SearchQuery[] = [
  // ---- Short queries (15) ----
  { id: "q01", query: "深度学习", category: "short", groundTruth: ["深度学习基础", "PyTorch框架入门", "微积分要点"], notes: VAULT_NOTES },
  { id: "q02", query: "Transformer", category: "short", groundTruth: ["Transformer架构分析", "BERT预训练模型", "注意力机制详解"], notes: VAULT_NOTES },
  { id: "q03", query: "Docker", category: "short", groundTruth: ["Docker容器技术", "Docker部署深度学习项目"], notes: VAULT_NOTES },
  { id: "q04", query: "Python", category: "short", groundTruth: ["Python编程笔记", "PyTorch框架入门"], notes: VAULT_NOTES },
  { id: "q05", query: "NLP", category: "short", groundTruth: ["自然语言处理入门", "BERT预训练模型", "注意力机制详解"], notes: VAULT_NOTES },
  { id: "q06", query: "Linux", category: "short", groundTruth: ["Linux常用命令"], notes: VAULT_NOTES },
  { id: "q07", query: "GAN", category: "short", groundTruth: ["GAN生成对抗网络"], notes: VAULT_NOTES },
  { id: "q08", query: "数学", category: "short", groundTruth: ["线性代数复习", "微积分要点", "概率论基础", "机器学习数学基础"], notes: VAULT_NOTES },
  { id: "q09", query: "数据库", category: "short", groundTruth: ["数据库SQL基础"], notes: VAULT_NOTES },
  { id: "q10", query: "知识图谱", category: "short", groundTruth: ["知识图谱构建方法", "图神经网络GNN"], notes: VAULT_NOTES },
  { id: "q11", query: "注意力", category: "short", groundTruth: ["注意力机制详解", "Transformer架构分析"], notes: VAULT_NOTES },
  { id: "q12", query: "LLM", category: "short", groundTruth: ["大模型LLM综述", "Prompt工程实践", "RAG检索增强生成", "Agent智能体架构"], notes: VAULT_NOTES },
  { id: "q13", query: "Git", category: "short", groundTruth: ["Git版本控制入门"], notes: VAULT_NOTES },
  { id: "q14", query: "PyTorch", category: "short", groundTruth: ["PyTorch框架入门", "深度学习基础"], notes: VAULT_NOTES },
  { id: "q15", query: "Agent", category: "short", groundTruth: ["Agent智能体架构", "强化学习原理"], notes: VAULT_NOTES },

  // ---- Long queries (10) ----
  { id: "q16", query: "深度学习中的反向传播算法怎么实现", category: "long", groundTruth: ["深度学习基础", "微积分要点"], notes: VAULT_NOTES },
  { id: "q17", query: "如何在Docker中部署一个PyTorch训练环境", category: "long", groundTruth: ["Docker部署深度学习项目", "Docker容器技术", "PyTorch框架入门"], notes: VAULT_NOTES },
  { id: "q18", query: "图神经网络在分子性质预测中的应用", category: "long", groundTruth: ["图神经网络GNN"], notes: VAULT_NOTES },
  { id: "q19", query: "Transformer的自注意力机制和BERT的预训练方法", category: "long", groundTruth: ["Transformer架构分析", "注意力机制详解", "BERT预训练模型"], notes: VAULT_NOTES },
  { id: "q20", query: "机器学习模型评估用什么指标比较好", category: "long", groundTruth: ["模型评估与验证"], notes: VAULT_NOTES },
  { id: "q21", query: "怎么用Git管理代码版本和分支", category: "long", groundTruth: ["Git版本控制入门"], notes: VAULT_NOTES },
  { id: "q22", query: "使用GAN生成图片的原理是什么", category: "long", groundTruth: ["GAN生成对抗网络"], notes: VAULT_NOTES },
  { id: "q23", query: "Python数据预处理和特征工程的常用方法", category: "long", groundTruth: ["数据预处理技术", "Python编程笔记"], notes: VAULT_NOTES },
  { id: "q24", query: "强化学习中Q-Learning和Policy Gradient的区别", category: "long", groundTruth: ["强化学习原理"], notes: VAULT_NOTES },
  { id: "q25", query: "如何写一个好的Prompt让大模型准确回答", category: "long", groundTruth: ["Prompt工程实践", "大模型LLM综述"], notes: VAULT_NOTES },

  // ---- Mixed Chinese-English (10) ----
  { id: "q26", query: "CNN卷积神经网络架构对比", category: "mixed", groundTruth: ["卷积神经网络详解", "计算机视觉基础"], notes: VAULT_NOTES },
  { id: "q27", query: "BERT和GPT的Transformer区别", category: "mixed", groundTruth: ["BERT预训练模型", "Transformer架构分析", "大模型LLM综述"], notes: VAULT_NOTES },
  { id: "q28", query: "YOLO目标检测v8版本", category: "mixed", groundTruth: ["YOLO目标检测", "计算机视觉基础"], notes: VAULT_NOTES },
  { id: "q29", query: "RAG检索增强生成怎么实现", category: "mixed", groundTruth: ["RAG检索增强生成", "Agent智能体架构"], notes: VAULT_NOTES },
  { id: "q30", query: "SQL JOIN类型详解", category: "mixed", groundTruth: ["数据库SQL基础"], notes: VAULT_NOTES },
  { id: "q31", query: "GNN GraphSAGE和GCN的区别", category: "mixed", groundTruth: ["图神经网络GNN"], notes: VAULT_NOTES },
  { id: "q32", query: "PCA降维和SVD分解", category: "mixed", groundTruth: ["线性代数复习", "数据预处理技术"], notes: VAULT_NOTES },
  { id: "q33", query: "ReAct Agent模式怎么设计", category: "mixed", groundTruth: ["Agent智能体架构", "Prompt工程实践"], notes: VAULT_NOTES },
  { id: "q34", query: "LoRA微调LLM的优势", category: "mixed", groundTruth: ["大模型LLM综述"], notes: VAULT_NOTES },
  { id: "q35", query: "Docker compose多容器编排", category: "mixed", groundTruth: ["Docker容器技术", "Docker部署深度学习项目"], notes: VAULT_NOTES },

  // ---- Edge cases (15) ----
  { id: "q36", query: "怎么用", category: "edge", groundTruth: [], notes: VAULT_NOTES },
  { id: "q37", query: "笔记方法有哪些", category: "edge", groundTruth: ["Zettelkasten笔记方法"], notes: VAULT_NOTES },
  { id: "q38", query: "什么是注意力", category: "edge", groundTruth: ["注意力机制详解", "Transformer架构分析"], notes: VAULT_NOTES },
  { id: "q39", query: "概率", category: "edge", groundTruth: ["概率论基础", "机器学习数学基础"], notes: VAULT_NOTES },
  { id: "q40", query: "hello world", category: "edge", groundTruth: [], notes: VAULT_NOTES },
  { id: "q41", query: "基础入门", category: "edge", groundTruth: ["深度学习基础", "自然语言处理入门", "Python编程笔记"], notes: VAULT_NOTES },
  { id: "q42", query: "模型训练部署上线", category: "edge", groundTruth: ["PyTorch框架入门", "Docker部署深度学习项目", "模型评估与验证"], notes: VAULT_NOTES },
  { id: "q43", query: "A", category: "edge", groundTruth: [], notes: VAULT_NOTES },
  { id: "q44", query: "卷积池化全连接", category: "edge", groundTruth: ["卷积神经网络详解"], notes: VAULT_NOTES },
  { id: "q45", query: "生成模型GAN VAE扩散模型对比", category: "edge", groundTruth: ["GAN生成对抗网络"], notes: VAULT_NOTES },
  { id: "q46", query: "强化学习智能体环境交互奖励策略梯度", category: "edge", groundTruth: ["强化学习原理", "Agent智能体架构"], notes: VAULT_NOTES },
  { id: "q47", query: "计算机视觉图像分类检测分割", category: "edge", groundTruth: ["计算机视觉基础", "卷积神经网络详解", "YOLO目标检测"], notes: VAULT_NOTES },
  { id: "q48", query: "预训练微调prompt RLHF alignment", category: "edge", groundTruth: ["大模型LLM综述", "BERT预训练模型", "Prompt工程实践"], notes: VAULT_NOTES },
  { id: "q49", query: "图结构消息传递节点嵌入聚合", category: "edge", groundTruth: ["图神经网络GNN", "知识图谱构建方法"], notes: VAULT_NOTES },
  { id: "q50", query: "", category: "edge", groundTruth: [], notes: VAULT_NOTES },
];
