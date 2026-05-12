export type CmxDiagnosticSource = {
  file: string;
  line: number;
  column: number;
};

export type CmxDiagnostic = {
  severity: "error";
  code: string;
  message: string;
  source?: CmxDiagnosticSource;
};
