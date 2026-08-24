import { Link } from "react-router-dom";

export default function AgentTypeSelect() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[900px] mx-auto">
      <div className="mb-8">
        <Link to="/admin/agents" className="text-sm text-foreground-500 hover:text-foreground-700 mb-2 flex items-center gap-1">
          <i className="ri-arrow-left-line"></i> 返回列表
        </Link>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground-950 mt-1">创建智能体</h1>
        <p className="text-sm text-foreground-500 mt-1">请选择智能体类型</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Consultant Type */}
        <Link
          to="/admin/agents/create/consultant"
          className="group bg-background-50 border border-background-200/70 rounded-2xl p-6 md:p-8 hover:border-primary-300 hover:shadow-sm transition-all text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
            <i className="ri-chat-3-line text-3xl text-blue-600"></i>
          </div>
          <h2 className="text-xl font-display font-bold text-foreground-950 mb-2">顾问型智能体</h2>
          <p className="text-sm text-foreground-500 leading-relaxed mb-3">对话式交互，像顾问一样与客户多轮聊天，灵活推进，输出对话回复。</p>
          <ul className="space-y-1.5 mb-5">
            <li className="flex items-center gap-2 text-xs text-foreground-600">
              <i className="ri-checkbox-circle-line text-green-500"></i> 多轮对话，灵活推进
            </li>
            <li className="flex items-center gap-2 text-xs text-foreground-600">
              <i className="ri-checkbox-circle-line text-green-500"></i> 调用C/K/Q/D库支撑
            </li>
            <li className="flex items-center gap-2 text-xs text-foreground-600">
              <i className="ri-checkbox-circle-line text-green-500"></i> 支持数据回写档案
            </li>
          </ul>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold group-hover:bg-primary-600 transition-all whitespace-nowrap">
            选择此类型 <i className="ri-arrow-right-line"></i>
          </span>
        </Link>

        {/* Tool Type */}
        <Link
          to="/admin/agents/create/tool"
          className="group bg-background-50 border border-background-200/70 rounded-2xl p-6 md:p-8 hover:border-primary-300 hover:shadow-sm transition-all text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
            <i className="ri-survey-line text-3xl text-primary-600"></i>
          </div>
          <h2 className="text-xl font-display font-bold text-foreground-950 mb-2">工具型智能体</h2>
          <p className="text-sm text-foreground-500 leading-relaxed mb-3">固定输出，根据客户输入产出确定结果——测评/推荐/诊断/报告，填完即出结果。</p>
          <ul className="space-y-1.5 mb-5">
            <li className="flex items-center gap-2 text-xs text-foreground-600">
              <i className="ri-checkbox-circle-line text-green-500"></i> 表单或对话收集输入
            </li>
            <li className="flex items-center gap-2 text-xs text-foreground-600">
              <i className="ri-checkbox-circle-line text-green-500"></i> 调用C/K库规则处理
            </li>
            <li className="flex items-center gap-2 text-xs text-foreground-600">
              <i className="ri-checkbox-circle-line text-green-500"></i> 输出报告/卡片/推荐
            </li>
          </ul>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold group-hover:bg-primary-600 transition-all whitespace-nowrap">
            选择此类型 <i className="ri-arrow-right-line"></i>
          </span>
        </Link>
      </div>
    </div>
  );
}