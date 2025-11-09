import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";

const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, any> = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")} ]`.replace(" ]", "]");
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const setContents = useFile(state => state.setContents);
  const getJson = useJson(state => state.getJson);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(() => normalizeNodeData(nodeData?.text ?? []));

  React.useEffect(() => {
    setEditValue(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(false);
  }, [nodeData]);

  const handleEdit = () => setIsEditing(true);
  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(normalizeNodeData(nodeData?.text ?? []));
  };

  const setValueAtPath = (root: any, path: any[] | undefined, value: any) => {
    if (!path || path.length === 0) return value;
    const clone = JSON.parse(JSON.stringify(root));
    let cur: any = clone;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i] as any;
      if (cur[seg] === undefined) cur[seg] = typeof path[i + 1] === "number" ? [] : {};
      cur = cur[seg];
    }
    const last = path[path.length - 1] as any;
    // if both existing and new value are plain objects, merge them instead of replacing
    const existing = cur[last];
    const isPlainObject = (v: any) => v && typeof v === "object" && !Array.isArray(v);

    const deepMerge = (target: any, src: any): any => {
      const out = Array.isArray(target) ? [...target] : { ...target };
      Object.keys(src).forEach(key => {
        const sv = src[key];
        const tv = out[key];
        if (isPlainObject(tv) && isPlainObject(sv)) {
          out[key] = deepMerge(tv, sv);
        } else {
          out[key] = sv;
        }
      });
      return out;
    };

    if (isPlainObject(existing) && isPlainObject(value)) {
      cur[last] = deepMerge(existing, value);
    } else {
      cur[last] = value;
    }
    return clone;
  };

  const handleSaveClick = async () => {
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(editValue);
      } catch {
        // fallback to string value if not valid JSON
        parsed = editValue;
      }

      const rootJsonStr = getJson();
      const rootObj = JSON.parse(rootJsonStr);

      const newRoot = setValueAtPath(rootObj, nodeData?.path as any, parsed);

      await setContents({ contents: JSON.stringify(newRoot, null, 2) });

      // after graph updates, re-select the node with the same path
      setTimeout(() => {
        const nodes = useGraph.getState().nodes;
        const target = nodes.find(n => JSON.stringify(n.path) === JSON.stringify(nodeData?.path));
        if (target) setSelectedNode(target);
      }, 600);

      setIsEditing(false);
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert("Save failed: " + (err?.message || err));
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex align="center" gap="xs">
              {!isEditing ? (
                <Button size="xs" onClick={handleEdit}>Edit</Button>
              ) : (
                <>
                  <Button size="xs" onClick={handleSaveClick}>Save</Button>
                  <Button size="xs" variant="light" onClick={handleCancel}>Cancel</Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {isEditing ? (
              <Textarea
                minRows={6}
                value={editValue}
                onChange={e => setEditValue(e.currentTarget.value)}
                styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
              />
            ) : (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
        </Stack>

        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
