module.exports = {
    apps: [
        {
            name: 'coreline-crm-backend',
            script: 'dist/server.js',
            instances: 1, // Change to 'max' if you want to run exactly the number of CPU cores
            autorestart: true,
            watch: false, // Don't watch files in production
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'development',
                PORT: 7834, // User-defined port
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 7834, // User-defined port
            }
        }
    ]
};
