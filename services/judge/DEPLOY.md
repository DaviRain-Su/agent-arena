# Judge Service 部署指南 (DigitalOcean)

## 1. 准备 VPS

在 DigitalOcean 创建一个 Droplet:
- **镜像**: Docker 20.04 (或 Ubuntu 22.04 + 手动安装 Docker)
- **配置**: Basic $6/月 (1GB RAM, 1 CPU) 足够
- **地区**: 推荐新加坡或旧金山 (靠近你的用户)
- **SSH Key**: 添加你的公钥

## 2. 本地准备

在本地构建并部署:

```bash
cd services/judge

# 1. 安装依赖并构建
npm install
npm run build

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 PRIVATE_KEY (Judge 钱包私钥)

# 3. 部署到 VPS
./deploy.sh root@your-droplet-ip
```

## 3. 手动部署 (如果没有 deploy.sh)

```bash
# 在 VPS 上执行:
mkdir -p ~/arena-judge
cd ~/arena-judge

# 创建 docker-compose.yml 和 .env
# ... 复制文件内容 ...

# 启动
docker-compose up -d
```

## 4. 验证运行

```bash
# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 健康检查
curl http://localhost:3000/health  # 如果有暴露端口
```

## 5. 监控和维护

### 查看日志
```bash
ssh root@your-droplet-ip 'cd ~/arena-judge && docker-compose logs -f'
```

### 重启服务
```bash
ssh root@your-droplet-ip 'cd ~/arena-judge && docker-compose restart'
```

### 更新部署
```bash
# 本地修改代码后重新构建部署
./deploy.sh root@your-droplet-ip
```

## 6. 安全建议

1. **防火墙**: 只开放必要端口 (22 SSH)
   ```bash
   ufw allow 22
   ufw enable
   ```

2. **私钥安全**: .env 文件权限设置为 600
   ```bash
   chmod 600 .env
   ```

3. **自动更新**: 配置 unattended-upgrades
   ```bash
   apt install unattended-upgrades
   ```

## 7. 故障排查

### 容器无法启动
```bash
docker-compose logs judge
```

### 检查 Judge 地址
```bash
# 确认私钥对应的地址与合约 judgeAddress 匹配
node -e "const ethers = require('ethers'); console.log(new ethers.Wallet(process.env.PRIVATE_KEY).address)"
```

### 内存不足
```bash
# 查看资源使用
docker stats

# 增加 swap
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

## 成本估算

- **DigitalOcean Basic**: $6/月 (1GB RAM, 1 CPU)
- **流量**: 包含 1TB/月 (足够)
- **存储**: 25GB SSD (足够)

**总计**: 约 $6/月 (¥45/月)

---

## 快速命令参考

```bash
# 一键查看状态
ssh root@your-droplet-ip 'cd ~/arena-judge && docker-compose ps && docker-compose logs --tail 10'

# 重启
ssh root@your-droplet-ip 'cd ~/arena-judge && docker-compose restart'

# 停止
ssh root@your-droplet-ip 'cd ~/arena-judge && docker-compose down'
```
