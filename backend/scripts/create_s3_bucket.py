"""
Run once to create the S3 bucket for raw crawl markdown storage.
Usage: python scripts/create_s3_bucket.py <bucket-name>
"""

import sys
import boto3
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

AWS_PROFILE = "Website-intel-dev"
AWS_REGION  = "us-east-1"


def create_bucket(bucket_name: str):
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    s3 = session.client("s3")

    existing = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
    if bucket_name in existing:
        print(f"Bucket '{bucket_name}' already exists — nothing to do.")
        return

    print(f"Creating bucket '{bucket_name}' in {AWS_REGION}...")

    if AWS_REGION == "us-east-1":
        s3.create_bucket(Bucket=bucket_name)
    else:
        s3.create_bucket(
            Bucket=bucket_name,
            CreateBucketConfiguration={"LocationConstraint": AWS_REGION},
        )

    # Block all public access
    s3.put_public_access_block(
        Bucket=bucket_name,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )

    print(f"Bucket '{bucket_name}' created and public access blocked.")
    print(f"Add this to your .env:  S3_BUCKET={bucket_name}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/create_s3_bucket.py <bucket-name>")
        sys.exit(1)
    create_bucket(sys.argv[1])
