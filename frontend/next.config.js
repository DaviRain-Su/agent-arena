/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_TASK_MANAGER_ADDRESS: process.env.NEXT_PUBLIC_TASK_MANAGER_ADDRESS,
    NEXT_PUBLIC_PAYMENT_HUB_ADDRESS: process.env.NEXT_PUBLIC_PAYMENT_HUB_ADDRESS,
  },
};

module.exports = nextConfig;
