export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-6 md:px-12 lg:px-24 py-8 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <h3 className="font-serif text-lg font-bold">Chasing Chapters</h3>
            <p className="text-sm text-muted-foreground mt-1">
              A personal space for book lovers.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Chasing Chapters. All rights
            reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
