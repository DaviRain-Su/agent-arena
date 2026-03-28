export type Language = 'en' | 'zh';

export const translations = {
  en: {
    // Common
    appName: 'AGENT ARENA',
    appSubtitle: 'AGENT ORCHESTRATION PROTOCOL',
    connect: 'CONNECT WALLET',
    disconnect: 'TERMINATE',
    cancel: 'CANCEL',
    confirm: 'CONFIRM',
    loading: 'LOADING...',
    
    // Landing Page
    heroTitle: 'DECENTRALIZED',
    heroSubtitle: 'AGENT SWARM',
    heroDesc: 'Deploy autonomous AI agents. Build collaborative workflows. Create agent teams for complex multi-step operations.',
    enterSystem: 'ENTER SYSTEM',
    
    // Features
    agentMarket: 'AGENT SWARM',
    agentMarketDesc: 'Discover and deploy pre-built agents. Publish your own agents to the swarm.',
    teamFormation: 'TEAM FORMATION',
    teamFormationDesc: 'Assemble agent squads. Coordinate multi-agent conversations and task execution.',
    workflowBuilder: 'WORKFLOW BUILDER',
    workflowBuilderDesc: 'Design automated pipelines. Sequential, parallel, and conditional execution modes.',
    
    // Stats
    activeAgents: 'ACTIVE AGENTS',
    workflows: 'WORKFLOWS',
    teamsFormed: 'TEAMS FORMED',
    tasksExecuted: 'TASKS EXECUTED',
    
    // Navigation
    navWorkflows: 'WORKFLOWS',
    navMarket: 'MARKETPLACE',
    navTeams: 'AGENT SWARM',
    navTasks: 'TASKS',
    
    // Agent Market
    marketTitle: 'AGENT MARKETPLACE',
    marketSubtitle: 'DISCOVER // DEPLOY // PUBLISH',
    searchAgents: 'SEARCH AGENTS...',
    allCategories: 'ALL',
    categoryData: 'DATA',
    categorySecurity: 'SECURITY',
    categoryDefi: 'DEFI',
    categoryAI: 'AI',
    categoryTrading: 'TRADING',
    deploy: 'DEPLOY',
    publishAgent: 'PUBLISH AGENT',
    
    // Team
    teamTitle: 'TEAM FORMATION',
    teamSubtitle: 'ASSEMBLE AGENT SQUADS // COLLABORATIVE EXECUTION',
    createTeam: 'CREATE TEAM',
    activeTeams: 'ACTIVE TEAMS',
    selectTeam: 'SELECT A TEAM TO VIEW CHANNEL',
    membersOnline: 'MEMBERS ONLINE',
    enterCommand: 'ENTER COMMAND...',
    
    // Workflow
    workflowTitle: 'WORKFLOW BUILDER',
    executionMode: 'EXECUTION MODE',
    sequential: 'SEQUENTIAL',
    parallel: 'PARALLEL',
    conditional: 'CONDITIONAL',
    availableAgents: 'AVAILABLE AGENTS',
    workflowSteps: 'WORKFLOW STEPS',
    deployWorkflow: 'DEPLOY WORKFLOW',
    
    // System
    systemStatus: 'SYSTEM STATUS',
    connection: 'CONNECTION',
    online: 'ONLINE',
    walletId: 'WALLET ID',
    systemTime: 'SYSTEM TIME',
    memoryUsage: 'MEMORY USAGE',
    cpuLoad: 'CPU LOAD',
    eventLog: 'EVENT LOG',
  },
  
  zh: {
    // Common
    appName: 'AGENT ARENA',
    appSubtitle: '智能体编排协议',
    connect: '连接钱包',
    disconnect: '终止连接',
    cancel: '取消',
    confirm: '确认',
    loading: '加载中...',
    
    // Landing Page
    heroTitle: '去中心化',
    heroSubtitle: '智能体集群',
    heroDesc: '部署自主 AI 智能体。构建协作工作流。创建智能体团队执行复杂多步骤操作。',
    enterSystem: '进入系统',
    
    // Features
    agentMarket: '智能体蜂群',
    agentMarketDesc: '发现并部署预构建智能体。将你自己的智能体发布到蜂群。',
    teamFormation: '团队组建',
    teamFormationDesc: '组建智能体小队。协调多智能体对话和任务执行。',
    workflowBuilder: '工作流构建器',
    workflowBuilderDesc: '设计自动化流程。支持顺序、并行和条件执行模式。',
    
    // Stats
    activeAgents: '活跃智能体',
    workflows: '工作流',
    teamsFormed: '已组建团队',
    tasksExecuted: '已执行任务',
    
    // Navigation
    navWorkflows: '工作流',
    navMarket: '市场',
    navTeams: '智能体蜂群',
    navTasks: '任务',
    
    // Agent Market
    marketTitle: '智能体市场',
    marketSubtitle: '发现 // 部署 // 发布',
    searchAgents: '搜索智能体...',
    allCategories: '全部',
    categoryData: '数据',
    categorySecurity: '安全',
    categoryDefi: 'DeFi',
    categoryAI: 'AI',
    categoryTrading: '交易',
    deploy: '部署',
    publishAgent: '发布智能体',
    
    // Team
    teamTitle: '团队组建',
    teamSubtitle: '组建智能体小队 // 协作执行',
    createTeam: '创建团队',
    activeTeams: '活跃团队',
    selectTeam: '选择团队查看频道',
    membersOnline: '成员在线',
    enterCommand: '输入命令...',
    
    // Workflow
    workflowTitle: '工作流构建器',
    executionMode: '执行模式',
    sequential: '顺序执行',
    parallel: '并行执行',
    conditional: '条件执行',
    availableAgents: '可用智能体',
    workflowSteps: '工作流步骤',
    deployWorkflow: '部署工作流',
    
    // System
    systemStatus: '系统状态',
    connection: '连接状态',
    online: '在线',
    walletId: '钱包地址',
    systemTime: '系统时间',
    memoryUsage: '内存使用',
    cpuLoad: 'CPU 负载',
    eventLog: '事件日志',
  }
};

export function t(key: keyof typeof translations.en, lang: Language): string {
  return translations[lang][key] || key;
}
