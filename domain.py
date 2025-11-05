from io import BytesIO
import random
import string
import sys
import argparse
from huggingface_hub import HfApi

parser = argparse.ArgumentParser(description="创建适配 domain 项目的 Hugging Face Space")
parser.add_argument("--token", type=str, required=True, help="Hugging Face Token（需要写权限）")
parser.add_argument("--image", type=str, default="", help="Docker 镜像地址")
parser.add_argument("--password", type=str, required=True, help="管理员密码")
parser.add_argument("--database-url", type=str, required=True, help="数据库连接字符串")
parser.add_argument("--cf-key", type=str, default="", help="Cloudflare API Token")
parser.add_argument("--tg-bot-token", type=str, default="", help="Telegram 机器人Token")
parser.add_argument("--tg-user-id", type=str, default="", help="Telegram ChatID")
parser.add_argument("--wechat-sendkey", type=str, default="", help="微信Server酱")
parser.add_argument("--qmsg-key", type=str, default="", help="Qmsg酱 Key")
parser.add_argument("--qmsg-qq", type=str, default="", help="Qmsg酱 接收QQ")
parser.add_argument("--webdav-url", type=str, default="", help="WebDAV 地址")
parser.add_argument("--webdav-user", type=str, default="", help="WebDAV 用户名")
parser.add_argument("--webdav-pass", type=str, default="", help="WebDAV 密码")
parser.add_argument("--git-token", type=str, default="", help="GitHub Token")
args = parser.parse_args()


def generate_random_string(length=2):
    """生成包含至少一个字母的随机字符串"""
    if length < 1:
        return ""
    chars = string.ascii_letters + string.digits
    mandatory_letter = random.choice(string.ascii_letters)
    remaining_chars = random.choices(chars, k=length - 1)
    full_chars = remaining_chars + [mandatory_letter]
    random.shuffle(full_chars)
    return "".join(full_chars)


if __name__ == "__main__":
    token = args.token
    if not token:
        print("Token 不能为空")
        sys.exit(1)

    api = HfApi(token=token)
    user_info = api.whoami()
    if not user_info.get("name"):
        print("未获取到用户名信息，程序退出。")
        sys.exit(1)

    userid = user_info.get("name")

    image = args.image or "ghcr.io/zxlwq/domain:latest"

    space_name = generate_random_string(2)
    repoid = f"{userid}/{space_name}"

    readme_content = f"""
---
title: {space_name}
emoji: 🌐
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 3000
pinned: false
---
基于 domain 项目的 Space（使用 Docker 运行）。
"""
    readme_obj = BytesIO(readme_content.encode("utf-8"))

    secrets = []
    def add_secret(key, value):
        if value is not None and str(value).strip() != "":
            secrets.append({"key": key, "value": str(value)})

    add_secret("PASSWORD", args.password)
    add_secret("DATABASE_URL", args.database_url)
    add_secret("CF_KEY", args.cf_key)
    add_secret("TG_BOT_TOKEN", args.tg_bot_token)
    add_secret("TG_USER_ID", args.tg_user_id)
    add_secret("WECHAT_SENDKEY", args.wechat_sendkey)
    add_secret("QMSG_KEY", args.qmsg_key)
    add_secret("QMSG_QQ", args.qmsg_qq)
    add_secret("WEBDAV_URL", args.webdav_url)
    add_secret("WEBDAV_USER", args.webdav_user)
    add_secret("WEBDAV_PASS", args.webdav_pass)
    add_secret("GIT_TOKEN", args.git_token)

    api.create_repo(
        repo_id=repoid,
        repo_type="space",
        space_sdk="docker",
        space_secrets=secrets,
    )

    api.upload_file(
        repo_id=repoid,
        path_in_repo="README.md",
        path_or_fileobj=readme_obj,
        repo_type="space",
    )

    dockerfile_content = f"FROM {image}\n"
    api.upload_file(
        repo_id=repoid,
        path_in_repo="Dockerfile",
        path_or_fileobj=BytesIO(dockerfile_content.encode("utf-8")),
        repo_type="space",
    )

    print(f"✅ Space 创建成功: {repoid}")


