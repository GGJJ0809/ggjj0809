interface SearchConfig {
  placeholder?: string;
}

export default function SearchRenderer({ config, isPreview = false }: { config: SearchConfig; isPreview?: boolean }) {
  return (
    <section className={isPreview ? "py-3 px-3" : "py-8 px-4 md:px-6 max-w-3xl mx-auto"}>
      <div className={`flex items-center gap-2 ${isPreview ? "px-3 py-2" : "px-4 py-3"} rounded-full bg-background-50 border border-background-200/70 hover:border-primary-300 transition-all`}>
        <i className={`ri-search-line ${isPreview ? "text-sm" : "text-lg"} text-foreground-400`}></i>
        <input type="text" placeholder={config.placeholder || "搜索..."} className={`flex-1 bg-transparent ${isPreview ? "text-xs" : "text-sm"} text-foreground-800 placeholder:text-foreground-400 outline-none`} />
        <button className={`${isPreview ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} rounded-full bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors whitespace-nowrap`}>搜索</button>
      </div>
    </section>
  );
}