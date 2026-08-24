import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MATERIALS_TABLE = "inbound_materials";
const SUPPLIERS_TABLE = "suppliers";
const OPERATORS_TABLE = "scale_operators";
const SALT = "scale_salt_2026";

interface Material {
  id: number;
  name: string;
  category_name: string;
  unit: string;
  unit_price: number;
  supplier_id: number | null;
  material_type: number;
  bar_code: string | null;
  is_active: boolean;
  notes: string | null;
}

interface Supplier {
  id: number;
  name: string;
  contact: string;
  phone: string;
  address: string;
  category: string;
  is_active: boolean;
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Helper: make Supabase REST calls
  async function supabaseGet(table: string, query: string) {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/${table}?${query}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!resp.ok) {
      throw new Error(`Supabase query failed: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  try {
    // ─── POST /login ─── 操作员登录验证
    if ((path === "/login" || path.endsWith("/login")) && req.method === "POST") {
      const payload = await req.json().catch(() => ()) as Record<string, unknown>;
      const workNo = String(payload.work_no ?? "").trim();
      const password = String(payload.password ?? "");
      const deviceSn = String(payload.device_sn ?? "").trim();

      if (!workNo || !password || !deviceSn) {
        return new Response(
          JSON.stringify({ code: "InvalidParameter", message: "缺少必填参数: work_no, password, device_sn" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const expectedHash = await sha256Hex(`${deviceSn}${workNo}${SALT}${password}`);

      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("device_sn", "eq." + deviceSn);
      params.set("work_no", "eq." + workNo);
      params.set("is_active", "eq.true");
      params.set("limit", "1");

      const result = await supabaseGet(OPERATORS_TABLE, params.toString()) as Array<Record<string, unknown>>;
      const operator = result?.[0];

      if (!operator || operator.password_hash !== expectedHash) {
        return new Response(
          JSON.stringify({ code: "AuthFailed", message: "工号或密码错误" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      const tokenPayload = `${operator.id}:${deviceSn}:${Date.now()}`;
      const token = await sha256Hex(`${tokenPayload}${SALT}`);

      return new Response(
        JSON.stringify({
          code: "OK",
          data: {
            token,
            operator: {
              id: operator.id,
              name: operator.name,
              work_no: operator.work_no,
              role: operator.role,
              device_sn: operator.device_sn,
            },
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── GET /materials ───
    if (path === "/materials" || path.endsWith("/materials")) {
      const search = url.searchParams.get("search") || "";
      const category = url.searchParams.get("category") || "";
      const type = url.searchParams.get("type") || "";
      const activeOnly = url.searchParams.get("active_only") !== "false";

      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("order", "name.asc");

      let result = await supabaseGet(MATERIALS_TABLE, params.toString()) as (Material & { suppliers?: Supplier })[];

      if (activeOnly) {
        result = result.filter((m) => m.is_active);
      }

      if (search) {
        const q = search.toLowerCase();
        result = result.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.bar_code && m.bar_code.toLowerCase().includes(q))
        );
      }

      if (category) {
        result = result.filter((m) => m.category_name === category);
      }

      if (type) {
        const t = parseInt(type, 10);
        result = result.filter((m) => m.material_type === t);
      }

      const supplierIds = [...new Set(result.map((m) => m.supplier_id).filter(Boolean))];
      let supplierMap: Record<number, string> = {};

      if (supplierIds.length > 0) {
        const supResp = await supabaseGet(
          SUPPLIERS_TABLE,
          `select=id,name&id=in.(${supplierIds.join(",")})`
        ) as Supplier[];
        supplierMap = Object.fromEntries(supResp.map((s) => [s.id, s.name]));
      }

      const output = result.map((m) => ({
        id: m.id,
        name: m.name,
        category_name: m.category_name,
        unit: m.unit,
        unit_price: m.unit_price,
        supplier_id: m.supplier_id,
        supplier_name: m.supplier_id ? (supplierMap[m.supplier_id] || "") : "",
        material_type: m.material_type,
        material_type_label: m.material_type === 1 ? "原料" : "商品",
        bar_code: m.bar_code,
        notes: m.notes,
      }));

      return new Response(JSON.stringify({ code: "OK", data: output, total: output.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── GET /suppliers ───
    if (path === "/suppliers" || path.endsWith("/suppliers")) {
      const search = url.searchParams.get("search") || "";
      const category = url.searchParams.get("category") || "";
      const activeOnly = url.searchParams.get("active_only") !== "false";

      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("order", "name.asc");

      let result = await supabaseGet(SUPPLIERS_TABLE, params.toString()) as Supplier[];

      if (activeOnly) {
        result = result.filter((s) => s.is_active);
      }

      if (search) {
        const q = search.toLowerCase();
        result = result.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.contact && s.contact.toLowerCase().includes(q)) ||
            (s.phone && s.phone.includes(q))
        );
      }

      if (category) {
        result = result.filter((s) => s.category === category);
      }

      return new Response(JSON.stringify({ code: "OK", data: result, total: result.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── GET /categories ───
    if (path === "/categories" || path.endsWith("/categories")) {
      const params = new URLSearchParams();
      params.set("select", "category_name");
      params.set("order", "category_name.asc");

      const result = await supabaseGet(MATERIALS_TABLE, params.toString()) as { category_name: string }[];
      const categories = [...new Set(result.map((r) => r.category_name).filter(Boolean))];

      return new Response(JSON.stringify({ code: "OK", data: categories }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── GET /supplier-categories ───
    if (path === "/supplier-categories" || path.endsWith("/supplier-categories")) {
      const params = new URLSearchParams();
      params.set("select", "category");
      params.set("order", "category.asc");

      const result = await supabaseGet(SUPPLIERS_TABLE, params.toString()) as { category: string }[];
      const categories = [...new Set(result.map((r) => r.category).filter(Boolean))];

      return new Response(JSON.stringify({ code: "OK", data: categories }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── 404 ───
    return new Response(JSON.stringify({ code: "NotFound", message: `Unknown endpoint: ${path}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ code: "Error", message: e instanceof Error ? e.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
