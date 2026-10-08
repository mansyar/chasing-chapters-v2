// Ambient declarations for non-TS assets imported for side effects.
// Required for `bun check` (TypeScript 7) which errors on untyped
// side-effect imports (TS2882).

declare module "*.css";
declare module "*.scss";
declare module "@payloadcms/next/css";
