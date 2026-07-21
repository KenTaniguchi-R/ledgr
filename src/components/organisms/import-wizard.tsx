"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/molecules/file-dropzone";
import { ColumnMapper } from "@/components/molecules/column-mapper";
import { ImportPreview } from "@/components/molecules/import-preview";
import type { ColumnMapping } from "@/lib/import/mapper";

type Step = "upload" | "map" | "preview" | "importing" | "done";

interface Account {
  id: string;
  name: string;
}

interface Props {
  accounts: Account[];
}

export function ImportWizard({ accounts }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"csv" | "ofx">("csv");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [convention, setConvention] = useState<"positive_is_expense" | "positive_is_income">("positive_is_expense");
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ duplicateCount: number; uniqueCount: number } | null>(null);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);

    const formData = new FormData();
    formData.append("file", f);
    formData.append("step", "preview");

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setFileType(data.type);
    setHeaders(data.headers);
    setRows(data.rows);
    setTotalRows(data.totalRows);

    if (data.type === "ofx") {
      setStep("preview");
    } else {
      setMapping(data.suggestedMapping ?? {});
      setStep("map");
    }
  }

  async function handleImport(skipDuplicates = false) {
    if (!file) return;
    setStep("importing");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("step", "import");
    formData.append("accountId", accountId);
    formData.append("convention", convention);
    formData.append("skipDuplicates", String(skipDuplicates));
    if (fileType === "csv") {
      formData.append("mapping", JSON.stringify(mapping));
    }

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setStep("preview");
      return;
    }

    if (data.status === "duplicates_found") {
      setDuplicateInfo({ duplicateCount: data.duplicateCount, uniqueCount: data.uniqueCount });
      setStep("preview");
      return;
    }

    setResult(data);
    setStep("done");
  }

  const cardTitle =
    step === "map"
      ? "Map Columns"
      : step === "preview"
        ? "Preview"
        : step === "importing"
          ? "Importing..."
          : step === "done"
            ? "Import Complete"
            : null;

  return (
    <Card className="w-full">
      {cardTitle && (
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {step === "upload" && (
          <>
            <FileDropzone onFile={handleFile} />
            <p className="text-sm text-muted-foreground text-center">
              Prefer automatic sync?{" "}
              <Link href="/accounts" className="text-primary hover:underline">
                Connect a bank instead
              </Link>
            </p>
          </>
        )}

        {step === "map" && (
          <>
            <ColumnMapper headers={headers} mapping={mapping} onChange={setMapping} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={() => setStep("preview")}>Next</Button>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <ImportPreview headers={headers} rows={rows} totalRows={totalRows} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Target Account</Label>
                <Select value={accountId} onValueChange={(v) => { if (v !== null) setAccountId(v); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {fileType === "csv" && (
                <div className="space-y-1">
                  <Label className="text-xs">Amount Sign Convention</Label>
                  <Select value={convention} onValueChange={(v) => setConvention(v as typeof convention)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive_is_expense">Positive = Expense</SelectItem>
                      <SelectItem value="positive_is_income">Positive = Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {duplicateInfo && (
              <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm dark:border-yellow-900 dark:bg-yellow-950">
                <p className="font-medium">{duplicateInfo.duplicateCount} potential duplicates found</p>
                <p className="text-muted-foreground">{duplicateInfo.uniqueCount} unique transactions will be imported.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => handleImport(true)}>Skip Duplicates &amp; Import</Button>
                  <Button size="sm" variant="outline" onClick={() => { setDuplicateInfo(null); handleImport(false); }}>Import All Anyway</Button>
                </div>
              </div>
            )}

            {!duplicateInfo && (
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(fileType === "csv" ? "map" : "upload")}>Back</Button>
                <Button onClick={() => handleImport()}>
                  Import {totalRows} Transactions
                </Button>
              </div>
            )}
          </>
        )}

        {step === "importing" && (
          <div className="space-y-2 py-4">
            <Progress value={null} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">Processing...</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 py-4">
            <p className="text-sm">
              Imported <strong>{result.imported}</strong> transactions.
              {result.skipped > 0 && ` Skipped ${result.skipped} duplicates.`}
            </p>
            <Button onClick={() => router.push("/transactions")}>View Transactions</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
