import { IndexEvent } from "../../webapp/app_event";

import { batchSet, scanPrefixGlobal } from "plugos-silverbullet-syscall/index";
import { parseMarkdown } from "plugos-silverbullet-syscall/markdown";
import { collectNodesOfType, ParseTree, renderToText } from "../../common/tree";
import { whiteOutQueries } from "../query/util";
import { applyQuery, QueryProviderEvent } from "../query/engine";

export type Item = {
  name: string;
  nested?: string;
  // Not stored in DB
  page?: string;
  pos?: number;
};

export async function indexItems({ name, text }: IndexEvent) {
  let items: { key: string; value: Item }[] = [];
  text = whiteOutQueries(text);

  console.log("Indexing items", name);
  let mdTree = await parseMarkdown(text);

  let coll = collectNodesOfType(mdTree, "ListItem");

  coll.forEach((n) => {
    if (!n.children) {
      return;
    }
    let textNodes: ParseTree[] = [];
    let nested: string | undefined;
    for (let child of n.children!.slice(1)) {
      if (child.type === "OrderedList" || child.type === "BulletList") {
        nested = renderToText(child);
        break;
      }
      textNodes.push(child);
    }
    let item = textNodes.map(renderToText).join("").trim();
    let value: Item = {
      name: item,
    };
    if (nested) {
      value.nested = nested;
    }
    items.push({
      key: `it:${n.from}`,
      value,
    });
  });
  console.log("Found", items.length, "item(s)");
  await batchSet(name, items);
}

export async function queryProvider({
  query,
}: QueryProviderEvent): Promise<string> {
  let allItems: Item[] = [];
  for (let { key, page, value } of await scanPrefixGlobal("it:")) {
    let [, pos] = key.split(":");
    allItems.push({
      ...value,
      page: page,
      pos: +pos,
    });
  }
  let markdownItems = applyQuery(query, allItems).map(
    (item) =>
      `* [[${item.page}@${item.pos}]] ${item.name}` +
      (item.nested ? "\n  " + item.nested : "")
  );
  return markdownItems.join("\n");
}
