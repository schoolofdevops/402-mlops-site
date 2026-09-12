---
sidebar_position: 2
title: "Lab: Building an MLOps CI Pipeline with GitHub Actions"
---
# Building an MLOps CI Pipeline with GitHub Actions

Everything you have done so far, you did by typing commands. Process the data, engineer the
features, train the model, build the image. It works, and it stops working the day you forget
a step or somebody else has to do it.

In this lab you would hand the whole sequence to a pipeline. You push code, and GitHub runs
the same steps you have been running, in the same order, every single time.

## What will you learn

  * How a GitHub Actions workflow is put together, and what each part of the syntax means
  * How to write a small single job pipeline first, before attempting the big one
  * How to store registry credentials safely, using variables and secrets rather than hard coding
  * How to build a multi stage pipeline where each job depends on the one before it
  * How to pass files between jobs, since each job starts on a fresh machine
  * Why an ML pipeline is just a CI pipeline with a different kind of application in it

## Pre Requisites

You should have finished Lab 4, and your work should be pushed to your fork.

```
cd house-price-predictor
git status
```

Make sure the tree is clean and that `Dockerfile`, `streamlit_app/Dockerfile` and
`docker-compose.yaml` are all committed.

You also need a Docker Hub account, which you created in Lab 2.

## The pipeline you are about to build

```bash
   git push to main
         |
         v
   +-----------------+     +------------------+     +---------------------+
   | data-processing |---->|  model-training  |---->|  build-and-publish  |
   +-----------------+     +------------------+     +---------------------+
     run_processing.py       train_model.py            docker build
     engineer.py             (with MLflow)             docker push
         |                         |                        |
         v                         v                        v
     artifacts:              artifacts:                 Docker Hub
     featured data           trained model
     preprocessor
```

where,

  * each **job** runs on its own fresh virtual machine, with nothing carried over
  * **needs** is what makes them run in order rather than all at once
  * **artifacts** are how a file produced by one job reaches the next one

That last point is the one that surprises people. Job two does not have the files job one
created. They are on a different machine that has already been thrown away. So anything you
want to pass along has to be uploaded and downloaded explicitly.

This shape has a name. It is a DAG, that is a directed acyclic graph, which is nothing but a
set of steps with arrows showing what has to finish before what. Every pipeline tool you meet
later, whether it is Argo Workflows, Airflow or Kubeflow, is built on the same idea.

## PART I - Your first workflow

Do not start with the big pipeline. Start with something small enough that when it breaks, you
know where to look.

This first workflow does one job. It builds the Streamlit image and pushes it to Docker Hub,
and it only runs when something under `streamlit_app/` changes.

**Create** the workflows directory.

```
cd house-price-predictor
mkdir -p .github/workflows
```

**Write** the workflow.

`file: .github/workflows/streamlit-ci.yaml`

```
name: Streamlit CI

on:
  push:
    paths:
      - 'streamlit_app/**'
  workflow_dispatch:

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to DockerHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: docker.io
          username: ${{ vars.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./streamlit_app
          push: true
          tags: docker.io/${{ vars.DOCKERHUB_USERNAME }}/streamlit:latest
          platforms: linux/amd64,linux/arm64
```

Let's read the important parts of that.

**on** decides when the workflow runs. Here it runs on a push, but only when files under
`streamlit_app/` changed. So editing a notebook would not rebuild the web image. The
`workflow_dispatch` line adds a manual Run workflow button in the GitHub interface, which is
very useful while you are still getting it working.

**runs-on** picks the machine. `ubuntu-latest` is a fresh Ubuntu VM that GitHub gives you and
throws away when the job ends.

**uses** pulls in a prewritten action so you do not have to script it yourself.
`actions/checkout` gets your code onto the machine, and the `docker/` ones handle login and
build.

**vars** and **secrets** are two different stores. A variable is readable, and a secret is
masked in the logs. Your username goes in one, your token in the other.

**platforms** builds for both Intel and ARM, so the same image runs on a normal server and on
an Apple Silicon laptop.

**Commit and push** it.

```
git add .github/workflows/streamlit-ci.yaml
git commit -am "adding CI workflow for streamlit"
git push origin main
```

The workflow now exists, but it would fail, because it has no way to log in to Docker Hub yet.
Let's fix that.

## PART II - Setting up registry credentials

A pipeline needs to authenticate to Docker Hub the same way you do. You would never put a
password in a YAML file, so you would use an access token instead, stored as a secret.

### Generating the token

Log in to Docker Hub and go to Account Settings -> Personal Access Tokens -> Generate Token.
You could also go straight to the page.

  * [https://app.docker.com/settings/personal-access-tokens/create](https://app.docker.com/settings/personal-access-tokens/create)

Generate the token with `Read & Write` access and copy it. Docker Hub shows it once. If you
navigate away without copying it, you would have to generate a new one.

### Storing it in GitHub

Go to your repository, then Settings -> Secrets and variables -> Actions.

**Add a repository variable** on the Variables tab.

  * Name : `DOCKERHUB_USERNAME`
  * Value : your actual Docker ID

`make sure this goes under Variables and not under Secrets. The workflow reads it as vars.DOCKERHUB_USERNAME, and it would come up empty if it is stored in the wrong place`

**Add a repository secret** on the Secrets tab.

  * Name : `DOCKERHUB_TOKEN`
  * Value : the token you just copied

### Running it

Go to your repository -> Actions. Select `Streamlit CI` and press Run workflow.

**Verify** two things when it goes green.

  * Open the job log and expand the push step. The tag it pushed should be visible
  * Go to Docker Hub and confirm a `streamlit` repository now exists with a `latest` tag

`if the login step fails, the token is wrong or expired. If the tag reads docker.io//streamlit:latest with two slashes, your username variable is empty, which means it went in as a secret by mistake`

## PART III - The full MLOps pipeline

Now the real one. This pipeline runs the whole path from raw data to a published image.

Here is the skeleton of the three jobs, so you can see the shape before the detail.

`file: .github/workflows/mlops-pipeline.yml`

```
name: MLOps Pipeline

on:
  xxx

jobs:
  data-processing:
    runs-on: xxx
    steps:
      - xxx

  model-training:
    needs: xxx
    runs-on: xxx
    steps:
      - xxx

  build-and-publish:
    needs: xxx
    runs-on: xxx
    steps:
      - xxx
```

**Problem Statement**

  * trigger on a push to `main`, on version tags, and on pull requests into `main`
  * **data-processing** should
      * check out the code and set up Python 3.11.9
      * install the requirements
      * run the processing script and then the feature engineering script
      * upload the featured dataset and the preprocessor as artifacts, since the next job cannot see them otherwise
  * **model-training** should
      * wait for data-processing to finish
      * download the featured dataset
      * start an MLflow server so that the run gets tracked
      * train the model and upload it as an artifact
      * stop the MLflow server afterwards
  * **build-and-publish** should
      * wait for model-training
      * download both the trained model and the preprocessor
      * log in to Docker Hub and build the API image from the root Dockerfile
      * push it as `house-price-model:latest`

Now the complete workflow.

`file: .github/workflows/mlops-pipeline.yml`

```
# .github/workflows/mlops-pipeline.yml
name: MLOps Pipeline

on:
  push:
    branches: [ main ]
    tags: [ 'v*.*.*' ]
  pull_request:
    branches: [ main ]

jobs:
  data-processing:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v2

    - name: Set up Python
      uses: actions/setup-python@v2
      with:
        python-version: '3.11.9'

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt

    - name: Process data
      run: |
        python src/data/run_processing.py --input data/raw/house_data.csv --output data/processed/cleaned_house_data.csv

    - name: Engineer features
      run: |
        python src/features/engineer.py --input data/processed/cleaned_house_data.csv --output data/processed/featured_house_data.csv --preprocessor models/trained/preprocessor.pkl

    - name: Upload processed data
      uses: actions/upload-artifact@v4
      with:
        name: processed-data
        path: data/processed/featured_house_data.csv

    - name: Upload preprocessor
      uses: actions/upload-artifact@v4
      with:
        name: preprocessor
        path: models/trained/preprocessor.pkl

  model-training:
    needs: data-processing
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v2

    - name: Set up Python
      uses: actions/setup-python@v2
      with:
        python-version: '3.11.9'

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt

    - name: Download processed data
      uses: actions/download-artifact@v4
      with:
        name: processed-data
        path: data/processed/

    - name: Set up MLflow
      run: |
        docker pull ghcr.io/mlflow/mlflow:latest
        docker run -d -p 5000:5000 --name mlflow-server ghcr.io/mlflow/mlflow:latest mlflow server --host 0.0.0.0 --backend-store-uri sqlite:///mlflow.db

    - name: Wait for MLflow to start
      run: |
        for i in {1..10}; do
          curl -f http://localhost:5000/health || sleep 5;
        done

    - name: Train model
      run: |
        mkdir -p models
        python src/models/train_model.py --config configs/model_config.yaml --data data/processed/featured_house_data.csv --models-dir models --mlflow-tracking-uri http://localhost:5000

    - name: Upload trained model
      uses: actions/upload-artifact@v4
      with:
        name: trained-model
        path: models/

    - name: Clean up MLflow
      run: |
        docker stop mlflow-server || true
        docker rm mlflow-server || true

  build-and-publish:
    needs: model-training
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v2

    - name: Download trained model
      uses: actions/download-artifact@v4
      with:
        name: trained-model
        path: models/

    - name: Download preprocessor
      uses: actions/download-artifact@v4
      with:
        name: preprocessor
        path: models/trained/

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3


    - name: Log in to DockerHub Container Registry
      uses: docker/login-action@v3
      with:
        registry: docker.io
        username: ${{ vars.DOCKERHUB_USERNAME }}
        password: ${{ secrets.DOCKERHUB_TOKEN }}


    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
          context: .
          file: ./Dockerfile
          push: true
          tags: docker.io/${{ vars.DOCKERHUB_USERNAME }}/house-price-model:latest
          platforms: linux/amd64,linux/arm64
```

  * Source : [mlops-pipeline](https://gist.githubusercontent.com/initcron/f3751f1b3b9407556f5ef5acbab998d2/raw/12ba9a8e12109d5c105ab30379e098d195cf7b80/mlops-pipeline.yaml)

Two things in there are worth looking at closely.

The **MLflow steps in the training job** start a tracking server inside the runner, use it, and
stop it at the end. It is temporary, which means the run history disappears with the machine.
That is fine for learning, and in real work you would point `--mlflow-tracking-uri` at a
permanent server instead, so the history survives.

The **wait loop** exists because starting a container and being able to talk to it are two
different moments. Without that loop, the training step would sometimes run before MLflow is
listening, and the job would fail for no obvious reason. Waiting for a service to become ready
is something you would write many times in your career.

**Commit and push.**

```
git add .github/workflows/mlops-pipeline.yml
git commit -am "adding github mlops pipeline workflow"
git push origin main
```

### Watching it run

Go to your repository -> Actions and open the running workflow.

You would see the three jobs drawn as a graph, running one after the other. Data processing,
then model training, then build and publish. That is the DAG from the diagram above, on screen.

**Verify** each of these.

  * All three jobs finish green
  * Open the data-processing job and confirm the feature engineering log looks like the one you
    saw locally in Lab 3
  * Check the Artifacts section at the bottom of the run summary. You should see
    `processed-data`, `preprocessor` and `trained-model`
  * Go to Docker Hub and confirm `house-price-model` now has a fresh `latest` tag

At this point a push to your repository trains a model and publishes a container image, with
nobody typing anything.

#### Observe

Look at the three jobs again. Notice that the whole thing is an ordinary CI pipeline. Check out
code, install dependencies, run some steps, build an image, push it.

The only thing that makes it a machine learning pipeline is what the steps happen to do. There
is no special ML build system involved. If you already know CI, you already know most of this.

## Exercise

Make the pipeline prove it is really running your code.

  * Change one thing in `src/features/engineer.py`, for example add a log line saying which
    version of the features you are building
  * Push to main
  * Find that exact log line in the GitHub Actions job output
  * Then make a change under `streamlit_app/` only, push it, and confirm that the MLOps pipeline
    did **not** run while the Streamlit one did

The second half matters. Path filters are what keep a large repository from running every
pipeline on every commit.

## Cleanup

Nothing to tear down. The runners are GitHub's machines and they clean themselves up.

Two housekeeping habits are worth building now.

**Cancel** any runs you no longer need, from the Actions tab, so you do not burn free minutes.

**Check** that your token is still valid if a build starts failing at the login step weeks
later. Docker Hub tokens can be revoked or expire.

#### Summary

In this lab you replaced yourself with a pipeline. You started small with a single job that
built one image, set up credentials properly using a variable and a secret rather than hard
coding anything, and then built the full three stage pipeline that processes data, trains a
model and publishes a container image.

You also learned that jobs do not share a filesystem, so artifacts are how work moves from one
stage to the next. And you saw that an MLOps pipeline is a normal CI pipeline. What changed is
the application inside it, not the machinery around it.

Your image is now sitting in a registry, built by a machine, reproducible on demand. In Lab 6
you would take that image and run it on a Kubernetes cluster, so it can scale beyond one
container on one laptop.

##### Reading List

  * [GitHub Actions workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
  * [Storing secrets and variables](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
  * [Storing workflow data as artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts)
  * [docker/build-push-action](https://github.com/docker/build-push-action)
  * [Docker Hub access tokens](https://docs.docker.com/security/for-developers/access-tokens/)

## Search Keywords

  * github actions workflow syntax on push paths
  * github actions workflow_dispatch manual trigger
  * github actions needs job dependency
  * upload-artifact download-artifact between jobs
  * github actions vars vs secrets
  * docker buildx multi platform build push
  * dockerhub personal access token
  * mlflow tracking uri in ci
