"use client";

import { useState } from "react";
import { Bookmark, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { saveReport, deleteReport } from "@/actions/reports";

interface SavedReport {
  id: string;
  name: string;
  reportType: string;
  filters: string;
}

interface SavedReportPickerProps {
  reports: SavedReport[];
  activeTab: string;
}

export function SavedReportPicker({
  reports,
  activeTab,
}: SavedReportPickerProps) {
  const { updateFilters, searchParams } = useSearchParamFilters();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportName, setReportName] = useState("");

  function loadReport(report: SavedReport) {
    try {
      const filters = JSON.parse(report.filters);
      const params: Record<string, string | null> = {
        tab: report.reportType === "spending" ? null : report.reportType,
        from: filters.dateFrom ?? null,
        to: filters.dateTo ?? null,
        accounts: filters.accountIds?.join(",") ?? null,
        categories: filters.categoryIds?.join(",") ?? null,
        preset: null,
      };
      updateFilters(params);
    } catch {
      // Invalid JSON — ignore
    }
  }

  async function handleSave() {
    if (!reportName.trim()) return;

    const filters = {
      dateFrom: searchParams.get("from") ?? "",
      dateTo: searchParams.get("to") ?? "",
      accountIds: searchParams
        .get("accounts")
        ?.split(",")
        .filter(Boolean),
      categoryIds: searchParams
        .get("categories")
        ?.split(",")
        .filter(Boolean),
    };

    await saveReport({
      name: reportName.trim(),
      reportType: activeTab as
        | "spending"
        | "income-expense"
        | "trends"
        | "net-worth",
      filters,
    });

    setReportName("");
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    await deleteReport(id);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Bookmark className="h-3 w-3 mr-1" />
              Saved Reports
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          {reports.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No saved reports yet
            </div>
          )}
          {reports.map((report) => (
            <DropdownMenuItem
              key={report.id}
              className="flex items-center justify-between"
              onClick={() => loadReport(report)}
            >
              <span className="truncate">{report.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(report.id);
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Save className="h-3 w-3 mr-2" />
            Save current view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>Save Report</DialogTitle>
          </DialogHeader>
          <Input
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="Report name"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={!reportName.trim()}
              size="sm"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
