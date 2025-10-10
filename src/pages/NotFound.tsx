import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="text-center space-y-4">
        <h1 className="mb-4 text-6xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Страница не найдена</p>
        <Link to="/">
          <Button className="bg-gradient-to-r from-primary to-accent">
            Вернуться на главную
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
