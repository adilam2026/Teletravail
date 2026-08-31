/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Le navigateur doit revérifier /sw.js à chaque visite : un service
        // worker mis en cache trop longtemps reste actif (et potentiellement
        // buggé) sur les postes qui l'ont chargé avant un correctif, même
        // après un nouveau déploiement.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
