import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description: string;
  footer: {
    text: string;
    linkText: string;
    href: string;
  };
  children: React.ReactNode;
}

export function AuthCard({ title, description, footer, children }: AuthCardProps) {
  return (
    <Card className="w-full max-w-sm shadow-lg shadow-black/5">
      <CardHeader className="text-center pb-2">
        <p className="text-2xl font-bold tracking-tight mb-1">Ledgr</p>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {footer.text}{" "}
          <Link
            href={footer.href}
            className="text-foreground underline-offset-4 hover:underline font-medium"
          >
            {footer.linkText}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
