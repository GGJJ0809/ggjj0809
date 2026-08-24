import CarouselRenderer from "./renderers/CarouselRenderer";
import ImageNavRenderer from "./renderers/ImageNavRenderer";
import SearchRenderer from "./renderers/SearchRenderer";
import ImageAdRenderer from "./renderers/ImageAdRenderer";
import { RichTextRenderer, AnnouncementRenderer } from "./renderers/ContentRenderers";
import { AudioRenderer, VideoRenderer } from "./renderers/MediaRenderers";
import KnowledgeProductRenderer from "./renderers/KnowledgeProductRenderer";
import DistributionProductRenderer from "./renderers/DistributionProductRenderer";
import LiveRenderer from "./renderers/LiveRenderer";
import CouponRenderer from "./renderers/CouponRenderer";
import PromotionRenderer from "./renderers/PromotionRenderer";

export interface SectionConfig {
  id?: number;
  section_type: string;
  title: string;
  config: Record<string, any>;
  sort_order: number;
  enabled: boolean;
}

export default function SectionRenderer({ section, isPreview = false }: { section: SectionConfig; isPreview?: boolean }) {
  const { section_type, config } = section;
  switch (section_type) {
    case "carousel": return <CarouselRenderer config={config} isPreview={isPreview} />;
    case "image_nav": return <ImageNavRenderer config={config} isPreview={isPreview} />;
    case "search": return <SearchRenderer config={config} isPreview={isPreview} />;
    case "image_ad": return <ImageAdRenderer config={config} isPreview={isPreview} />;
    case "rich_text": return <RichTextRenderer config={config} isPreview={isPreview} />;
    case "announcement": return <AnnouncementRenderer config={config} isPreview={isPreview} />;
    case "audio": return <AudioRenderer config={config} isPreview={isPreview} />;
    case "video": return <VideoRenderer config={config} isPreview={isPreview} />;
    case "knowledge_product": return <KnowledgeProductRenderer config={config} isPreview={isPreview} />;
    case "distribution_product": return <DistributionProductRenderer config={config} isPreview={isPreview} />;
    case "live": return <LiveRenderer config={config} isPreview={isPreview} />;
    case "coupon": return <CouponRenderer config={config} isPreview={isPreview} />;
    case "promotion": return <PromotionRenderer config={config} isPreview={isPreview} />;
    default: return null;
  }
}