import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { getErrorMessageKey } from "@/lib/appError";
import { useGraph } from "@/modules/graph/queries";
import { GraphView } from "@/pages/graph/GraphView";

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 600;

export function GraphPage() {
  const { t } = useTranslation();
  const [includeUnresolved, setIncludeUnresolved] = useState(false);
  const graphQuery = useGraph(includeUnresolved);

  const graph = graphQuery.data;
  const hasGraph = graph !== undefined;
  const isLoading = graphQuery.isPending;
  const hasFailed = graphQuery.isError;
  const hasNodes = hasGraph && graph.nodes.length > 0;
  const hasNoNodes = hasGraph && graph.nodes.length === 0;
  const subtitle = hasGraph
    ? t("graph.summary", { notes: graph.nodes.length, links: graph.edges.length })
    : undefined;

  return (
    <>
      <PageHeader
        title={t("nav.graph")}
        subtitle={subtitle}
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-small text-fg-secondary">
            <input
              type="checkbox"
              checked={includeUnresolved}
              onChange={(event) => setIncludeUnresolved(event.target.checked)}
              className="size-4 accent-primary"
            />
            {t("graph.includeUnresolved")}
          </label>
        }
      />
      {isLoading && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-96 w-full" />
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("graph.loadError")}
          description={t(getErrorMessageKey(graphQuery.error))}
          onRetry={() => void graphQuery.refetch()}
        />
      )}
      {hasNoNodes && (
        <EmptyState title={t("graph.empty.title")} description={t("graph.empty.description")} />
      )}
      {hasNodes && (
        <>
          <p className="text-caption text-fg-muted">{t("graph.hint")}</p>
          <GraphView
            graph={graph}
            width={GRAPH_WIDTH}
            height={GRAPH_HEIGHT}
            label={t("graph.canvasLabel")}
          />
        </>
      )}
    </>
  );
}
