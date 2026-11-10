import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { NoteSummary } from "@/bindings";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { useNoteLinks } from "@/modules/notes/linksQueries";

type BacklinksPanelProps = {
  noteId: string;
  folder: string | undefined;
  onCreateLink: (target: string) => void;
};

type NoteLinkRowProps = {
  note: NoteSummary;
  linkCount: number;
  folder: string | undefined;
};

function NoteLinkRow({ note, linkCount, folder }: NoteLinkRowProps) {
  const { t } = useTranslation();

  return (
    <li>
      <Link
        to="/notes/$noteId"
        params={{ noteId: note.id }}
        search={{ folder }}
        className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-muted"
      >
        <span className="truncate text-small text-fg">{note.title}</span>
        <span className="shrink-0 text-caption text-fg-muted">
          {t("notes.links.panel.count", { count: linkCount })}
        </span>
      </Link>
    </li>
  );
}

export function BacklinksPanel({ noteId, folder, onCreateLink }: BacklinksPanelProps) {
  const { t } = useTranslation();
  const linksQuery = useNoteLinks(noteId);

  const links = linksQuery.data;
  const backlinks = links?.backlinks ?? [];
  const outgoing = links?.outgoing ?? [];
  const hasBacklinks = backlinks.length > 0;
  const hasOutgoing = outgoing.length > 0;

  return (
    <section
      aria-label={t("notes.links.panel.title")}
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      {linksQuery.isPending && (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      )}
      {linksQuery.isError && (
        <ErrorState
          title={t("notes.links.panel.loadError")}
          description={t(getErrorMessageKey(linksQuery.error))}
          onRetry={() => void linksQuery.refetch()}
        />
      )}
      {linksQuery.isSuccess && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-small font-semibold text-fg">{t("notes.links.panel.backlinks")}</h3>
            {hasBacklinks ? (
              <ul className="flex flex-col">
                {backlinks.map((backlink) => (
                  <NoteLinkRow
                    key={backlink.note.id}
                    note={backlink.note}
                    linkCount={backlink.linkCount}
                    folder={folder}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-small text-fg-muted">{t("notes.links.panel.noBacklinks")}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-small font-semibold text-fg">{t("notes.links.panel.outgoing")}</h3>
            {hasOutgoing ? (
              <ul className="flex flex-col">
                {outgoing.map((link) => {
                  const { resolved } = link;
                  const isResolved = resolved !== null;

                  if (isResolved) {
                    return (
                      <NoteLinkRow
                        key={link.targetTitle}
                        note={resolved}
                        linkCount={link.linkCount}
                        folder={folder}
                      />
                    );
                  }
                  return (
                    <li key={link.targetTitle}>
                      <button
                        type="button"
                        onClick={() => onCreateLink(link.targetTitle)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-muted"
                      >
                        <span className="truncate text-small text-fg">{link.targetTitle}</span>
                        <span className="shrink-0 text-caption text-warning-fg">
                          {t("notes.links.panel.unresolved")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-small text-fg-muted">{t("notes.links.panel.noOutgoing")}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
