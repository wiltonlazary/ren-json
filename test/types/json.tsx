// ren-json as a TypeScript consumer sees it.
import { Root, Label } from 'ren-core';
import { $json, $tree } from 'ren-json';

const nodes = $json(() => <Label text="hi" />, { id: 'api', props: { user: 1 }, timeout: 5000 });
void nodes.then(list => list.map(node => (typeof node === 'string' ? node : node.role ?? node.item?.['@type'])));
void nodes.then(list => list.map(node => (typeof node === 'string' ? [] : node.children ?? [])));
Root({ id: 'data', renderer: $tree(), children: <Label text="x" /> });
// @ts-expect-error the timeout is a number
$json(() => null, { timeout: 'soon' });
