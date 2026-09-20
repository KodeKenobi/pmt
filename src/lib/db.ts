import { createSupabaseAdminClient } from "./supabase";

let supabaseAdminClient: ReturnType<typeof createSupabaseAdminClient> | null =
  null;

function getSupabaseAdminClient() {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createSupabaseAdminClient();
  }

  return supabaseAdminClient;
}

const supabase = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_target, property) {
    const client = getSupabaseAdminClient() as unknown as Record<
      string,
      unknown
    >;
    const value = client[property as keyof typeof client];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

type AnyObject = Record<string, unknown>;
type QueryResponse = { data: unknown; error: unknown; count?: number | null };
type SupabaseQuery = any;

type SelectionMeta = {
  path: string[];
  orderBy?: AnyObject;
  take?: number;
  countRelations?: string[];
  countOnly?: boolean;
};

const relationFilters: Record<
  string,
  Record<string, { table: string; foreignKey: string }>
> = {
  Project: {
    tickets: { table: "Ticket", foreignKey: "projectId" },
    milestones: { table: "Milestone", foreignKey: "projectId" },
  },
  Client: {
    tickets: { table: "Ticket", foreignKey: "clientId" },
    projects: { table: "Project", foreignKey: "clientId" },
  },
  Team: {
    teamMemberships: { table: "TeamMembership", foreignKey: "teamId" },
  },
  User: {
    teamMemberships: { table: "TeamMembership", foreignKey: "userId" },
  },
  TicketAttachment: {
    uploadedBy: { table: "User", foreignKey: "uploadedById" },
  },
  TicketComment: {
    author: { table: "User", foreignKey: "authorId" },
  },
  TicketActivity: {
    actor: { table: "User", foreignKey: "actorId" },
  },
};

function pascalCase(value: string) {
  return value.replace(/^[a-z]/, (char) => char.toUpperCase());
}

function isPlainObject(value: unknown): value is AnyObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function normalizeFilterValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFilterValue(item));
  }

  return value;
}

function compareValue(a: unknown, b: unknown, orderBy: unknown): number {
  if (orderBy === "asc" || orderBy === "desc") {
    const direction = orderBy === "asc" ? 1 : -1;
    if (a === b) return 0;
    if (a === null || a === undefined) return -1 * direction;
    if (b === null || b === undefined) return 1 * direction;
    if (typeof a === "string" && typeof b === "string") {
      return a.localeCompare(b) * direction;
    }
    if (typeof a === "number" && typeof b === "number") {
      return (a - b) * direction;
    }
    const aString = String(a);
    const bString = String(b);
    return aString.localeCompare(bString) * direction;
  }

  if (isPlainObject(orderBy)) {
    const [key, value] = Object.entries(orderBy)[0] ?? [];
    return compareValue(
      isPlainObject(a) ? (a as AnyObject)[key] : undefined,
      isPlainObject(b) ? (b as AnyObject)[key] : undefined,
      value,
    );
  }

  return 0;
}

function getValueAtPath(target: AnyObject | null | undefined, path: string[]) {
  let current: any = target;
  for (const segment of path) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[segment] as AnyObject | undefined;
  }
  return current;
}

function setValueAtPath(target: AnyObject, path: string[], value: unknown) {
  let current: AnyObject = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!isPlainObject(current[segment])) {
      current[segment] = {};
    }
    current = current[segment] as AnyObject;
  }
  current[path[path.length - 1]] = value;
}

function deleteValueAtPath(target: AnyObject, path: string[]) {
  let current: AnyObject = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!isPlainObject(current[segment])) {
      return;
    }
    current = current[segment] as AnyObject;
  }
  delete current[path[path.length - 1]];
}

async function _resolveSomeRelationIds(
  model: string,
  relation: string,
  condition: AnyObject,
): Promise<unknown[]> {
  const modelName = pascalCase(model);
  const relationDefinition = relationFilters[modelName]?.[relation];
  if (!relationDefinition) {
    return [];
  }

  let query = supabase
    .from(relationDefinition.table)
    .select(relationDefinition.foreignKey, { head: false });
  query = applyDirectFilters(query, condition);
  const response = (await query) as QueryResponse;
  const { data, error } = response;
  if (error) {
    throw error;
  }

  return Array.from(
    new Set(
      (data as AnyObject[])
        .map((row) => row[relationDefinition.foreignKey] as unknown)
        .filter((value) => value !== null && value !== undefined),
    ),
  );
}

function applyDirectFilters(
  query: SupabaseQuery,
  where: AnyObject,
): SupabaseQuery {
  let currentQuery: SupabaseQuery = query;

  for (const [field, value] of Object.entries(where)) {
    if (value === null) {
      currentQuery = currentQuery.is(field, null);
      continue;
    }

    if (isPlainObject(value)) {
      if (value.hasOwnProperty("in")) {
        currentQuery = currentQuery.in(
          field,
          normalizeFilterValue(value.in as unknown[]) as unknown[],
        );
        continue;
      }
      if (value.hasOwnProperty("notIn")) {
        currentQuery = currentQuery.not(
          field,
          "in",
          normalizeFilterValue(value.notIn as unknown[]) as unknown[],
        );
        continue;
      }
      if (value.hasOwnProperty("lt")) {
        currentQuery = currentQuery.lt(field, normalizeFilterValue(value.lt));
      }
      if (value.hasOwnProperty("lte")) {
        currentQuery = currentQuery.lte(field, normalizeFilterValue(value.lte));
      }
      if (value.hasOwnProperty("gt")) {
        currentQuery = currentQuery.gt(field, normalizeFilterValue(value.gt));
      }
      if (value.hasOwnProperty("gte")) {
        currentQuery = currentQuery.gte(field, normalizeFilterValue(value.gte));
      }
      if (value.hasOwnProperty("equals")) {
        currentQuery = currentQuery.eq(
          field,
          normalizeFilterValue(value.equals),
        );
      }
      if (
        value.hasOwnProperty("not") &&
        (value.not === null || typeof value.not !== "object")
      ) {
        if (value.not === null) {
          currentQuery = currentQuery.not(field, "is", null);
        } else {
          currentQuery = currentQuery.not(
            field,
            "eq",
            normalizeFilterValue(value.not as unknown),
          );
        }
      }
      if (value.hasOwnProperty("contains")) {
        currentQuery = currentQuery.ilike(field, `%${String(value.contains)}%`);
      }
      if (value.hasOwnProperty("startsWith")) {
        currentQuery = currentQuery.ilike(
          field,
          `${String(value.startsWith)}%`,
        );
      }
      if (value.hasOwnProperty("endsWith")) {
        currentQuery = currentQuery.ilike(field, `%${String(value.endsWith)}`);
      }
      continue;
    }

    if (Array.isArray(value)) {
      currentQuery = currentQuery.in(
        field,
        normalizeFilterValue(value) as unknown[],
      );
      continue;
    }

    currentQuery = currentQuery.eq(field, normalizeFilterValue(value));
  }

  return currentQuery;
}

function applyWhere(
  query: any,
  where: AnyObject | undefined,
  _modelName: string,
) {
  if (!where || Object.keys(where).length === 0) {
    return query;
  }

  if (where.OR && Array.isArray(where.OR)) {
    // Fallback to applying the first matching OR condition only.
    // Complex OR logic is handled in specific routes where needed.
    return applyDirectFilters(query, where.OR[0] as AnyObject);
  }

  return applyDirectFilters(query, where);
}

function buildSelection(
  spec: unknown,
  path: string[] = [],
): { select: string; metadata: SelectionMeta[] } {
  if (spec === true) {
    return { select: "*", metadata: [] };
  }

  if (!isPlainObject(spec)) {
    return { select: "", metadata: [] };
  }

  const fields: string[] = [];
  const metadata: SelectionMeta[] = [];

  function processField(key: string, value: unknown, currentPath: string[]) {
    if (value === true) {
      fields.push(key);
      return;
    }

    if (value === false) {
      return;
    }

    if (isPlainObject(value)) {
      const child = buildSelection(value, [...currentPath, key]);
      const selectValue = child.select || "*";
      fields.push(`${key}(${selectValue})`);
      metadata.push(...child.metadata);

      if (value.orderBy) {
        metadata.push({
          path: [...currentPath, key],
          orderBy: value.orderBy as AnyObject,
        });
      }

      if (typeof value.take === "number") {
        metadata.push({ path: [...currentPath, key], take: value.take });
      }

      return;
    }
  }

  function processSelectionObject(obj: AnyObject, currentPath: string[]) {
    if (obj.select || obj.include || obj._count) {
      if (obj.select) {
        for (const [key, value] of Object.entries(obj.select as AnyObject)) {
          processField(key, value, currentPath);
        }
      }

      if (obj.include) {
        for (const [key, value] of Object.entries(obj.include as AnyObject)) {
          if (value === true) {
            fields.push(`${key}(*)`);
            continue;
          }
          processField(key, value, currentPath);
        }
      }

      const countSelect = obj._count as AnyObject | undefined;
      if (countSelect?.select) {
        for (const [relation, countValue] of Object.entries(
          countSelect.select as AnyObject,
        )) {
          if (countValue) {
            fields.push(`${relation}(id)`);
            metadata.push({
              path: currentPath,
              countRelations: [relation],
              countOnly: true,
            });
          }
        }
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        processField(key, value, currentPath);
      }
    }
  }

  processSelectionObject(spec, path);

  return { select: fields.join(","), metadata };
}

function buildOrderBy(
  orderBy: unknown,
  path: string[] = [],
): {
  queryOrder: Array<{ column: string; ascending: boolean }>;
  metadata: SelectionMeta[];
} {
  const orders: Array<{ column: string; ascending: boolean }> = [];
  const metadata: SelectionMeta[] = [];

  if (!isPlainObject(orderBy)) {
    return { queryOrder: orders, metadata };
  }

  for (const [key, value] of Object.entries(orderBy)) {
    if (value === "asc" || value === "desc") {
      orders.push({
        column: [...path, key].join("."),
        ascending: value === "asc",
      });
      continue;
    }

    if (isPlainObject(value)) {
      metadata.push({ path: [...path, key], orderBy: value as AnyObject });
      continue;
    }
  }

  return { queryOrder: orders, metadata };
}

function sortArrayByOrder(array: unknown[], orderBy: AnyObject) {
  if (!Array.isArray(array)) {
    return array;
  }

  return [...array].sort((a, b) => compareValue(a, b, orderBy));
}

function applyPostProcessing(result: AnyObject, metadata: SelectionMeta[]) {
  for (const meta of metadata) {
    if (meta.countOnly && Array.isArray(meta.countRelations)) {
      for (const relation of meta.countRelations) {
        const relationRow = getValueAtPath(result, [...meta.path, relation]);
        const count = Array.isArray(relationRow) ? relationRow.length : 0;
        setValueAtPath(result, [...meta.path, "_count", relation], count);
        deleteValueAtPath(result, [...meta.path, relation]);
      }
    }

    if (meta.orderBy) {
      const target = getValueAtPath(result, meta.path);
      if (Array.isArray(target)) {
        const sorted = sortArrayByOrder(target, meta.orderBy);
        setValueAtPath(
          result,
          meta.path,
          typeof meta.take === "number" ? sorted.slice(0, meta.take) : sorted,
        );
      }
    }

    if (typeof meta.take === "number") {
      const target = getValueAtPath(result, meta.path);
      if (Array.isArray(target)) {
        setValueAtPath(result, meta.path, target.slice(0, meta.take));
      }
    }
  }
}

function buildTableName(model: string) {
  return pascalCase(model);
}

const db = new Proxy(
  {},
  {
    get(_target, modelName) {
      if (typeof modelName !== "string") {
        return undefined;
      }

      return {
        findMany: async (params: AnyObject = {}) => {
          const table = buildTableName(modelName);
          const { where, select, include, orderBy, take, _count } = params;
          const selection = buildSelection(
            {
              ...(select ? { select } : {}),
              ...(include ? { include } : {}),
              ...(_count ? { _count } : {}),
            },
            [],
          );
          const { queryOrder, metadata: orderMetadata } = buildOrderBy(orderBy);
          const selectExpression = selection.select || "*";

          let query = supabase
            .from(table)
            .select(selectExpression, { count: "exact" });
          query = applyWhere(query, where as AnyObject, modelName);

          for (const order of queryOrder) {
            query = query.order(order.column, {
              ascending: order.ascending,
              nullsFirst: false,
            });
          }

          if (typeof take === "number") {
            query = query.limit(take);
          }

          const response = (await query) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }

          const rows = Array.isArray(data) ? data : [];
          const postMetadata = [...selection.metadata, ...orderMetadata];
          return rows.map((row) => {
            const result = { ...row } as AnyObject;
            applyPostProcessing(result, postMetadata);
            return result;
          });
        },

        findUnique: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { where, select, include, _count } = params;
          const selection = buildSelection(
            {
              ...(select ? { select } : {}),
              ...(include ? { include } : {}),
              ...(_count ? { _count } : {}),
            },
            [],
          );
          const selectExpression = selection.select || "*";

          let query: SupabaseQuery = supabase
            .from(table)
            .select(selectExpression);
          const effectiveWhere = (where as AnyObject) || ({} as AnyObject);
          query = applyDirectFilters(query, effectiveWhere);
          const response = (await query.maybeSingle()) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }

          if (!data) {
            return null;
          }

          const result = { ...(data as AnyObject) } as AnyObject;
          applyPostProcessing(result, selection.metadata);
          return result;
        },

        findFirst: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { where, select, include, orderBy, take, _count } = params;
          const selection = buildSelection(
            {
              ...(select ? { select } : {}),
              ...(include ? { include } : {}),
              ...(_count ? { _count } : {}),
            },
            [],
          );
          const { queryOrder, metadata: orderMetadata } = buildOrderBy(orderBy);
          const selectExpression = selection.select || "*";

          let query = supabase
            .from(table)
            .select(selectExpression, { count: "exact" });
          query = applyWhere(query, where as AnyObject, modelName);

          for (const order of queryOrder) {
            query = query.order(order.column, {
              ascending: order.ascending,
              nullsFirst: false,
            });
          }

          if (typeof take === "number") {
            query = query.limit(take);
          }

          const response = (await query.maybeSingle()) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }

          if (!data) {
            return null;
          }

          const result = { ...(data as AnyObject) } as AnyObject;
          applyPostProcessing(result, [
            ...selection.metadata,
            ...orderMetadata,
          ]);
          return result;
        },

        create: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { data: createData, select, include, _count } = params;
          const selection = buildSelection(
            {
              ...(select ? { select } : {}),
              ...(include ? { include } : {}),
              ...(_count ? { _count } : {}),
            },
            [],
          );
          const selectExpression = selection.select || "*";

          const response = (await supabase
            .from(table)
            .insert(createData as AnyObject)
            .select(selectExpression)
            .single()) as QueryResponse;
          const { data, error } = response;

          if (error) {
            throw error;
          }

          const result = { ...(data as AnyObject) } as AnyObject;
          applyPostProcessing(result, selection.metadata);
          return result;
        },

        update: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { where, data: updateData, select, include, _count } = params;
          const selection = buildSelection(
            {
              ...(select ? { select } : {}),
              ...(include ? { include } : {}),
              ...(_count ? { _count } : {}),
            },
            [],
          );
          const selectExpression = selection.select || "*";

          const query: SupabaseQuery = supabase
            .from(table)
            .update(updateData as AnyObject)
            .match(where || {})
            .select(selectExpression)
            .single();

          const response = (await query) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }

          const result = { ...(data as AnyObject) } as AnyObject;
          applyPostProcessing(result, selection.metadata);
          return result;
        },

        delete: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { where } = params;
          const response = (await supabase
            .from(table)
            .delete()
            .match(where || {})
            .select("id")
            .single()) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }
          return data;
        },

        count: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { where } = params;
          let query: SupabaseQuery = supabase
            .from(table)
            .select("id", { count: "exact", head: true });
          query = applyWhere(query, where as AnyObject, modelName);
          const response = (await query) as QueryResponse;
          const { count, error } = response;
          if (error) {
            throw error;
          }
          return count ?? 0;
        },

        updateMany: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { where, data: updateData } = params;
          let query: SupabaseQuery = supabase
            .from(table)
            .update(updateData as AnyObject);
          query = applyWhere(query, where as AnyObject, modelName);
          const response = (await query) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }
          return { count: Array.isArray(data) ? data.length : 0 };
        },

        deleteMany: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const { where } = params;
          let query: SupabaseQuery = supabase.from(table).delete();
          query = applyWhere(query, where as AnyObject, modelName);
          const response = (await query.select("id")) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }
          return { count: Array.isArray(data) ? data.length : 0 };
        },

        groupBy: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const groupByParams = params as {
            where?: AnyObject;
            by: string[];
            _count?: unknown;
            orderBy?: unknown;
            take?: number;
            skip?: number;
          };
          const { where, by, orderBy, take } = groupByParams;

          let query: SupabaseQuery = supabase
            .from(table)
            .select(by.join(", "), { count: "exact", head: false });
          if (where) {
            query = applyWhere(query, where as AnyObject, modelName);
          }
          const response = (await query) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }

          const rows = Array.isArray(data) ? data : [];
          const groups: Record<string, AnyObject> = {};

          for (const row of rows) {
            const key = by
              .map((field: string) => String((row as AnyObject)[field]))
              .join("__");
            if (!groups[key]) {
              groups[key] = {};
              for (const field of by) {
                groups[key][field] = (row as AnyObject)[field];
              }
              groups[key]._count = { _all: 0 };
            }
            const countObject = groups[key]._count as AnyObject;
            const previousCount =
              typeof countObject._all === "number"
                ? (countObject._all as number)
                : 0;
            countObject._all = previousCount + 1;
          }

          let result = Object.values(groups);
          if (orderBy && Array.isArray(orderBy)) {
            // Supabase groupBy param may come as array or object. Fallback to no ordering.
          }
          if (typeof take === "number") {
            result = result.slice(0, take);
          }
          return result;
        },

        upsert: async (params: AnyObject) => {
          const table = buildTableName(modelName);
          const {
            where,
            create: createData,
            update: updateData,
            select,
            include,
            _count,
          } = params;
          const selection = buildSelection(
            {
              ...(select ? { select } : {}),
              ...(include ? { include } : {}),
              ...(_count ? { _count } : {}),
            },
            [],
          );
          const selectExpression = selection.select || "*";
          const conflictKeys = isPlainObject(where)
            ? Object.values(where)
                .filter(isPlainObject)
                .flatMap((item) => Object.keys(item))
            : [];

          const upsertPayload: AnyObject = {
            ...((isPlainObject(createData) ? createData : {}) as AnyObject),
            ...((isPlainObject(updateData) ? updateData : {}) as AnyObject),
          };

          const onConflict =
            conflictKeys.length > 0
              ? Array.from(new Set(conflictKeys)).join(",")
              : undefined;

          let query: SupabaseQuery = supabase
            .from(table)
            .upsert(upsertPayload, {
              onConflict,
            });

          if (selectExpression !== "*") {
            query = query.select(selectExpression);
          }

          query = query.single();
          const response = (await query) as QueryResponse;
          const { data, error } = response;
          if (error) {
            throw error;
          }
          const result = { ...(data as AnyObject) } as AnyObject;
          applyPostProcessing(result, selection.metadata);
          return result;
        },
      };
    },
  },
) as any;

export { db };
