export function identifier(id: string): string {
    return "\"" + id.replace(/"/g, "\"\"") + "\"";
}