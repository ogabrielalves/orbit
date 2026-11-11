import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ErrorState } from "@/components/molecules/ErrorState";
import { SegmentedControl } from "@/components/molecules/SegmentedControl";
import { getErrorMessageKey } from "@/lib/appError";
import { useLocalGraph } from "@/modules/graph/queries";
import { GraphView } from "@/pages/graph/GraphView";

const GRAPH_WIDTH = 640;
const GRAPH_HEIGHT = 320;
const depthOptions = ["1", "2", "3"] as const;

type LocalGraphPanelProps = {
  noteId: string;
  folder: string | undefined;
};

export function LocalGraphPanel({ noteId, folder }: LocalGraphPanelProps) {
  const { t } = useTranslation();
  const [depth, setDepth] = useState<(typeof depthOptions)[number]>("1");
  const graphQuery = useLocalGraph(noteId, Number(depth), false);

  const graph = graphQuery.data;
  const hasGraph = graph !== undefined;
  const isAlone = hasGraph && graph.nodes.length <= 1;
  const hasNeighbors = hasGraph && graph.nodes.length > 1;

  return (
    <section
      aria-label={t("graph.local.title")}
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-small font-semibold text-fg">{t("graph.local.title")}</h3>
        <SegmentedControl
          label={t("graph.local.depthLabel")}
          options={depthOptions.map((value) => ({
            value,
            label: t("graph.local.depth", { count: Number(value) }),
          }))}
          value={depth}
          onChange={setDepth}
        />
      </div>
      {graphQuery.isPending && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {graphQuery.isError && (
        <ErrorState
          title={t("graph.local.loadError")}
          description={t(getErrorMessageKey(graphQuery.error))}
          onRetry={() => void graphQuery.refetch()}
        />
      )}
      {isAlone && <p className="text-small text-fg-muted">{t("graph.local.empty")}</p>}
      {hasNeighbors && (
        <GraphView
          graph={graph}
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          label={t("graph.local.canvasLabel")}
          centerId={noteId}
          folder={folder}
        />
      )}
    </section>
  );
}
