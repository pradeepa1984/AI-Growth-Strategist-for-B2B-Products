&#x20;**Deployment Guide**



&#x20; Backend — FastAPI



&#x20; **Option A: AWS EC2**

&#x20; # 1. Launch EC2 (t3.small or larger), Ubuntu 22.04

&#x20; # 2. SSH in, install Python \& dependencies

&#x20; sudo apt update \&\& sudo apt install python3-pip -y

&#x20; pip install -r requirements.txt



&#x20; # 3. Set environment variables

&#x20; echo "FIRECRAWL\_API\_KEY=..." >> /etc/environment

&#x20; echo "EMAIL\_USER=..."       >> /etc/environment

&#x20; # etc.



&#x20; # 4. Run with gunicorn + uvicorn workers

&#x20; pip install gunicorn uvicorn\[standard]

&#x20; gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000



&#x20; # 5. Put behind nginx + add systemd service for persistence



&#x20; **Option B: Render (easiest, no DevOps)**

&#x20; 1. Push repo to GitHub

&#x20; 2. New Web Service → backend/ as root

&#x20; 3. Build command: pip install -r requirements.txt

&#x20; 4. Start command: uvicorn main:app --host 0.0.0.0 --port $PORT

&#x20; 5. Add all .env vars as Environment Variables in Render dashboard

&#x20; 6. AWS credentials: use IAM Role instead of named profile — change boto3.Session(profile\_name=...) to boto3.Session() and set AWS\_ACCESS\_KEY\_ID / AWS\_SECRET\_ACCESS\_KEY

&#x20; as env vars



&#x20; **Option C: Railway — identical steps to Render; railway.toml for config**



&#x20; ---

&#x20; Frontend — React



&#x20; Vercel (recommended)

&#x20; cd frontend

&#x20; npm run build          # produces dist/

&#x20; # Push to GitHub, connect repo to Vercel

&#x20; # Set VITE\_API\_BASE=https://your-backend.render.com in Vercel env vars



&#x20; Update API\_BASE in all components to use import.meta.env.VITE\_API\_BASE instead of the hardcoded localhost:8000.



&#x20; Netlify — same: npm run build → deploy dist/ folder, or connect GitHub repo.



&#x20; ---

&#x20; DynamoDB Setup



&#x20; # Tables already defined in scripts/; run once:

&#x20; aws dynamodb create-table \\

&#x20;   --table-name company\_intelligence \\

&#x20;   --attribute-definitions AttributeName=company\_url,AttributeType=S AttributeName=analysed\_at,AttributeType=S \\

&#x20;   --key-schema AttributeName=company\_url,KeyType=HASH AttributeName=analysed\_at,KeyType=RANGE \\

&#x20;   --billing-mode PAY\_PER\_REQUEST



&#x20; # Repeat for: market\_intelligence, content\_generation, leaddiscovery



&#x20; ---

&#x20; Environment Variables (.env)



&#x20; # AWS

&#x20; AWS\_REGION=us-east-1

&#x20; BEDROCK\_MODEL\_ID=us.anthropic.claude-3-5-haiku-20241022-v1:0

&#x20; S3\_BUCKET=your-bucket-name



&#x20; # External APIs

&#x20; FIRECRAWL\_API\_KEY=fc-...

&#x20; APOLLO\_API\_KEY=...



&#x20; # Email (Gmail App Password)

&#x20; EMAIL\_HOST=smtp.gmail.com

&#x20; EMAIL\_PORT=587

&#x20; EMAIL\_USER=yourname@gmail.com

&#x20; EMAIL\_PASS=xxxx xxxx xxxx xxxx   # 16-char app password, not login password



&#x20; # Remove test override in main.py before production:

&#x20; # Delete the OVERRIDE\_TO lines and use actual recipient directly



&#x20; Security: Never commit .env to git. Use Render/Railway secret management or AWS Secrets Manager for production API keys. For AWS credentials, use IAM roles on EC2 (no

&#x20; key/secret needed in env).

