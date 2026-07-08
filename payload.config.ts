import path from "path";
import { fileURLToPath } from "url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, type CollectionConfig } from "payload";

import { migrations } from "./src/migrations";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/* ── Collections ─────────────────────────────────────────────────────── */

const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: { useAsTitle: "email", group: "System" },
  fields: [
    { name: "name", type: "text" },
    {
      name: "role",
      type: "select",
      defaultValue: "reviewer",
      options: ["reviewer", "supervisor", "admin"],
    },
  ],
};

const Matters: CollectionConfig = {
  slug: "matters",
  labels: { singular: "Matter", plural: "Matters" },
  admin: {
    useAsTitle: "name",
    group: "Case Review",
    defaultColumns: ["name", "matterNumber", "team", "status"],
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "caption", type: "text" },
    { name: "matterNumber", type: "text", label: "Litify matter number" },
    { name: "sfId", type: "text", label: "Salesforce record ID" },
    { name: "team", type: "text" },
    { name: "attorney", type: "text" },
    {
      name: "status",
      type: "select",
      options: ["Intake", "Records Review", "Demand Prep", "Filed"],
      defaultValue: "Records Review",
    },
  ],
};

const CaseDocuments: CollectionConfig = {
  slug: "case-documents",
  labels: { singular: "Case Document", plural: "Case Documents" },
  admin: {
    useAsTitle: "title",
    group: "Case Review",
    defaultColumns: ["title", "docType", "pages", "status", "matter"],
    description:
      "Medical-record PDFs pulled from Litify (simulated) and processed by the pipeline. Open the enriched PDF to see highlights and bookmarks.",
  },
  fields: [
    { name: "title", type: "text", required: true },
    { name: "matter", type: "relationship", relationTo: "matters" },
    {
      type: "row",
      fields: [
        { name: "docType", type: "text", label: "Document type" },
        { name: "facility", type: "text" },
        { name: "received", type: "date" },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "pages", type: "number" },
        { name: "ocrPages", type: "number", label: "OCR pages" },
        {
          name: "meanOcrConf",
          type: "number",
          label: "Mean OCR confidence",
          admin: { step: 0.001 },
        },
        { name: "processingSeconds", type: "number" },
      ],
    },
    {
      name: "status",
      type: "select",
      options: ["Auto-Processed", "Needs Review", "Reviewed", "Written Back"],
    },
    {
      name: "enrichedPdfUrl",
      type: "text",
      label: "Enriched PDF",
      admin: {
        description: "AI-reviewed copy with highlights and a bookmark tree. Original is never modified.",
      },
    },
    { name: "slugId", type: "text", label: "Pipeline document ID", admin: { readOnly: true } },
    {
      type: "collapsible",
      label: "Salesforce identifiers",
      fields: [
        { name: "sfContentDocumentId", type: "text", label: "ContentDocument ID" },
        { name: "sfContentVersionId", type: "text", label: "ContentVersion ID" },
      ],
    },
  ],
};

const Findings: CollectionConfig = {
  slug: "findings",
  labels: { singular: "Finding", plural: "Findings" },
  defaultSort: "confidence",
  admin: {
    useAsTitle: "termLabel",
    group: "Case Review",
    defaultColumns: ["termLabel", "document", "page", "confidence", "routing", "decision"],
    listSearchableFields: ["termLabel", "variant", "evidence"],
    description:
      "Every pipeline extraction with its verbatim evidence and compound confidence. Set a decision to resolve review items — decisions are audit-logged.",
  },
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        if (operation === "update" && doc.decision && doc.decision !== previousDoc?.decision) {
          await req.payload.create({
            collection: "audit-events",
            data: {
              event: `review.${doc.decision}`,
              detail: `Finding "${doc.termLabel}" (p.${doc.page}) marked ${doc.decision}`,
              actor: req.user?.email ?? "admin",
              documentSlug: typeof doc.document === "object" ? doc.document?.slugId : undefined,
            },
            req,
          });
        }
      },
    ],
  },
  fields: [
    { name: "document", type: "relationship", relationTo: "case-documents", required: true },
    { name: "idx", type: "number", required: true, admin: { readOnly: true, position: "sidebar" } },
    {
      type: "row",
      fields: [
        { name: "termLabel", type: "text", label: "Term", required: true },
        { name: "categoryLabel", type: "text", label: "Category" },
        { name: "variant", type: "text", label: "Matched variant" },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "page", type: "number" },
        { name: "confidence", type: "number", admin: { step: 0.0001 } },
        { name: "matchQuality", type: "number", admin: { step: 0.0001 } },
        { name: "ocrConf", type: "number", label: "OCR confidence", admin: { step: 0.0001 } },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "routing",
          type: "select",
          options: ["auto", "review", "escalated", "negated"],
          admin: { description: "auto ≥ 85% · review 60–85% · escalated < 60% · negated context" },
        },
        { name: "source", type: "select", options: ["text_layer", "ocr"] },
        { name: "negated", type: "checkbox" },
      ],
    },
    {
      name: "evidence",
      type: "textarea",
      admin: { description: "Verbatim context window from the document." },
    },
    {
      name: "decision",
      type: "select",
      options: ["approved", "rejected", "corrected", "escalated"],
      admin: {
        position: "sidebar",
        description: "Human review decision. Saving a decision writes an audit event.",
      },
    },
    { name: "decidedBy", type: "text", admin: { position: "sidebar", readOnly: true } },
  ],
};

const AuditEvents: CollectionConfig = {
  slug: "audit-events",
  labels: { singular: "Audit Event", plural: "Audit Trail" },
  defaultSort: "-createdAt",
  admin: {
    useAsTitle: "event",
    group: "Case Review",
    defaultColumns: ["event", "detail", "actor", "createdAt"],
    description: "Append-only history: pipeline runs, Litify pulls, review decisions, write-backs.",
  },
  access: { update: () => false, delete: () => false },
  fields: [
    { name: "event", type: "text", required: true },
    { name: "detail", type: "textarea" },
    { name: "actor", type: "text" },
    { name: "documentSlug", type: "text", label: "Pipeline document ID" },
  ],
};

/* ── Config ──────────────────────────────────────────────────────────── */

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || "dev-only-fallback-secret",
  admin: {
    user: "users",
    meta: {
      titleSuffix: " — Seeger Weiss Case Automation",
    },
  },
  collections: [Matters, CaseDocuments, Findings, AuditEvents, Users],
  editor: lexicalEditor(),
  db: postgresAdapter({
    schemaName: "payload",
    prodMigrations: migrations,
    pool: {
      connectionString:
        process.env.DATABASE_URI ||
        "postgresql://payload_admin:placeholder@localhost:5432/postgres",
    },
  }),
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
