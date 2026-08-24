import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/home/page";
import Courses from "@/pages/courses/page";
import CourseDetail from "@/pages/courses/detail/page";
import LearnPage from "@/pages/learn/page";
import AgentsPage from "@/pages/agents/page";
import AgentDetailPage from "@/pages/agents/detail/page";
import ActivitiesPage from "@/pages/activities/page";
import MemberPage from "@/pages/member/page";
import MemberPlansPage from "@/pages/member/plans/page";
import DistributionCenter from "@/pages/member/distribution/page";
import ShopPage from "@/pages/shop/page";
import ShopDetail from "@/pages/shop/detail/page";
import CheckoutPage from "@/pages/shop/checkout/page";
import OrdersPage from "@/pages/shop/orders/page";
import AdminLayout from "@/pages/admin/Layout";
import Dashboard from "@/pages/admin/Dashboard/page";
import HomepageEditor from "@/pages/admin/HomepageEditor/page";
import CoursesAdmin from "@/pages/admin/Courses/page";
import ColumnsAdmin from "@/pages/admin/Columns/page";
import AiToolsAdmin from "@/pages/admin/AiTools/page";
import AiModelsAdmin from "@/pages/admin/AiModels/page";
import ActivitiesAdmin from "@/pages/admin/Activities/page";
import AssessmentsAdmin from "@/pages/admin/Assessments/page";
import MembersAdmin from "@/pages/admin/Members/page";
import PointsAdmin from "@/pages/admin/Points/page";
import ProductsAdmin from "@/pages/admin/Products/page";
import LiveAdmin from "@/pages/admin/Live/page";
import OrdersAdmin from "@/pages/admin/Orders/page";
import AffiliatesAdmin from "@/pages/admin/Affiliates/page";
import SettingsAdmin from "@/pages/admin/Settings/page";
import PaymentConfig from "@/pages/admin/Settings/PaymentConfig/page";
import AssetsAdmin from "@/pages/admin/Assets/page";
import CategoriesAdmin from "@/pages/admin/Categories/page";
import ChaptersAdmin from "@/pages/admin/Chapters/page";
import AgentsAdmin from "@/pages/admin/Agents/page";
import AgentTypeSelect from "@/pages/admin/Agents/components/TypeSelect";
import ConsultantAgentForm from "@/pages/admin/Agents/components/ConsultantAgentForm";
import ToolAgentForm from "@/pages/admin/Agents/components/ToolAgentForm";
import AgentEditRouter from "@/pages/admin/Agents/components/AgentEditRouter";
import CLibrary from "@/pages/admin/Libraries/C/page";
import KLibrary from "@/pages/admin/Libraries/K/page";
import QLibrary from "@/pages/admin/Libraries/Q/page";
import DLibrary from "@/pages/admin/Libraries/D/page";
import AuthPage from "@/pages/auth/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "design", element: <HomepageEditor /> },
      { path: "assets", element: <AssetsAdmin /> },
      { path: "categories", element: <CategoriesAdmin /> },
      { path: "chapters", element: <ChaptersAdmin /> },
      { path: "courses", element: <CoursesAdmin /> },
      { path: "columns", element: <ColumnsAdmin /> },
      { path: "ai-tools", element: <AiToolsAdmin /> },
      { path: "ai-models", element: <AiModelsAdmin /> },
      { path: "activities", element: <ActivitiesAdmin /> },
      { path: "assessments", element: <AssessmentsAdmin /> },
      { path: "members", element: <MembersAdmin /> },
      { path: "points", element: <PointsAdmin /> },
      { path: "products", element: <ProductsAdmin /> },
      { path: "live", element: <LiveAdmin /> },
      { path: "orders", element: <OrdersAdmin /> },
      { path: "affiliates", element: <AffiliatesAdmin /> },
      { path: "settings", element: <SettingsAdmin /> },
      { path: "settings/payment", element: <PaymentConfig /> },
      { path: "agents", element: <AgentsAdmin /> },
      { path: "agents/create", element: <AgentTypeSelect /> },
      { path: "agents/create/consultant", element: <ConsultantAgentForm /> },
      { path: "agents/create/tool", element: <ToolAgentForm /> },
      { path: "agents/:id/edit", element: <AgentEditRouter /> },
      { path: "libraries/c", element: <CLibrary /> },
      { path: "libraries/k", element: <KLibrary /> },
      { path: "libraries/q", element: <QLibrary /> },
      { path: "libraries/d", element: <DLibrary /> },
    ],
  },
  {
    path: "/courses",
    element: <Courses />,
  },
  {
    path: "/courses/:id",
    element: <CourseDetail />,
  },
  {
    path: "/learn/:courseId",
    element: <LearnPage />,
  },
  {
    path: "/agents",
    element: <AgentsPage />,
  },
  {
    path: "/agents/:id",
    element: <AgentDetailPage />,
  },
  {
    path: "/activities",
    element: <ActivitiesPage />,
  },
  {
    path: "/shop",
    element: <ShopPage />,
  },
  {
    path: "/shop/checkout",
    element: <CheckoutPage />,
  },
  {
    path: "/shop/orders",
    element: <OrdersPage />,
  },
  {
    path: "/shop/:id",
    element: <ShopDetail />,
  },
  {
    path: "/auth",
    element: <AuthPage />,
  },
  {
    path: "/member",
    element: <MemberPage />,
  },
  {
    path: "/member/plans",
    element: <MemberPlansPage />,
  },
  {
    path: "/member/distribution",
    element: <DistributionCenter />,
  },
  {
    path: "/ai-agent",
    element: (
      <div className="pt-20 px-4 text-center">
        <h1 className="text-2xl font-bold text-foreground-950">AI 教练</h1>
        <p className="mt-4 text-foreground-500">即将上线，敬请期待</p>
      </div>
    ),
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;