---
sidebar_position: 2
title: "Lab: Packaging the Model and Serving it with FastAPI"
---
# Packaging the Model and Serving it with FastAPI

At the end of Lab 3 you had two files sitting in a folder on your laptop. A model and a
preprocessor. Nobody can use a model that lives on your laptop. In this lab you are going to
wrap it in an API, put a web interface in front of it, package both into container images, and
run them together as one stack.

This is the handover point. Up to now you were doing the data scientist's job. From here on
you are doing the MLOps engineer's job.

## What will you learn

  * What actually gets handed over from a data scientist, and what is missing from that handover
  * How a model gets wrapped in a FastAPI service so that other systems can call it
  * How to write a Dockerfile that packages code and model together
  * How to build, run and test an image before trusting it
  * How to run the API and the web interface together with Docker Compose
  * How to debug an image that builds fine but fails the moment it starts

## Pre Requisites

You should have finished Lab 3, and you need both artifacts from it.

```
cd house-price-predictor
ls models/trained/
```

[sample output]
```
README.md        house_price_model.pkl      preprocessor.pkl
```

`if either file is missing, go back and finish Lab 3. Nothing in this lab works without them`

## The stack you are about to build

```bash
   +---------------------+          +----------------------+
   |   streamlit         |  HTTP    |   fastapi            |
   |   (web interface)   +--------->+   (model inference)  |
   |   port 8501         |          |   port 8000          |
   +---------------------+          +----------+-----------+
                                               |
                                               | loads at startup
                                               v
                                    +----------------------+
                                    | house_price_model.pkl|
                                    | preprocessor.pkl     |
                                    +----------------------+
```

where,

  * **fastapi** holds the model and does the actual prediction. It is the piece that matters
  * **streamlit** is only a client. It collects values from a form and calls the API
  * the two `.pkl` files are **baked into** the API image, that is copied in at build time

Baking the model into the image is the simplest approach and it is what you would use here. It
means the image is one self contained thing. The trade off is that a new model needs a new
image build, which is exactly what your CI pipeline in Lab 5 would take care of.

## PART I - Packaging the model API

### What the API does

**Open** and read through the API code before you package it.

```
src/api/main.py
src/api/inference.py
src/api/schemas.py
```

Three files, three jobs.

**schemas.py** defines the shape of a request. FastAPI uses it to check incoming data, so a
request with a missing field or a text value where a number belongs gets rejected before it
ever reaches your model.

**inference.py** does the real work. It loads the preprocessor and the model, applies the same
transformation you built in Lab 3, and returns a prediction.

**main.py** wires it together into a web service with a `/predict` endpoint.

That is the whole handover in code form. The data scientist gave you a model. You are giving
the rest of the world a way to call it.

### Writing the Dockerfile

Let's build the spec up rather than dropping the finished file on you. Here is the skeleton of
what any Dockerfile has to answer.

`file: Dockerfile`

```
FROM xxx

WORKDIR xxx

COPY xxx

RUN xxx

COPY xxx

EXPOSE xxx

CMD xxx
```

**Problem Statement**

  * start from a small Python 3.11 base, since a slim image pulls faster and has less to patch
  * work inside `/app`
  * copy in the API source from `src/api/`
  * install the Python packages the API needs
  * copy in the trained model and preprocessor from `models/trained/`
  * expose port 8000, which is where uvicorn would listen
  * start the app with uvicorn, bound to `0.0.0.0` so it is reachable from outside the container

Now the complete file. It goes in the root of the project, not inside `src/api/`.

`file: house-price-predictor/Dockerfile`

```
FROM python:3.11-slim

WORKDIR /app

COPY src/api/ .

RUN pip install -r requirements.txt

COPY models/trained/*.pkl models/trained/

EXPOSE 8000

CMD [ "uvicorn",  "main:app",  "--host",  "0.0.0.0",  "--port",  "8000" ]
```

Look at the order of the two `COPY` lines and the `RUN` in between. Requirements get installed
before the model is copied in. Docker caches each layer, so when you retrain and only the
`.pkl` files change, the install layer is reused and the build takes seconds instead of
minutes. Small detail, and you would feel it every single build once your CI pipeline is
running.

Also note `--host 0.0.0.0`. If you leave that out, uvicorn binds to localhost inside the
container only, and nothing outside can reach it. The container starts, the logs look
perfectly healthy, and every request times out.

### Building and testing the image

**Build** the image.

`replace xxxxxx with your Docker Hub username`

```
docker image build -t xxxxxx/house-price-model:dev .
```

**Verify** it exists, and have a look at how it was put together.

```
docker image ls
docker image history xxxxxx/house-price-model:dev
```

The history shows one line per layer. You can see your `COPY` and `RUN` steps, and how much
each one added to the image size.

**Run** it as a test container.

```
docker run -idt -p 8888:8000 --name api xxxxxx/house-price-model:dev
```

**Check** it started cleanly.

```
docker ps -n 1
docker logs api
```

Look for the uvicorn startup line in the logs. If the container is not in the list at all, it
started and exited, which means something inside failed. Go to the troubleshooting section
below.

**Test** it in the browser at [http://localhost:8888/docs](http://localhost:8888/docs).

FastAPI generates that page for you from the schemas. Expand `/predict`, press Try it out,
send a request, and confirm you get a price back.

You could also test it from the terminal.

```
curl -X POST "http://localhost:8888/predict" \
-H "Content-Type: application/json" \
-d '{
  "sqft": 1500,
  "bedrooms": 3,
  "bathrooms": 2,
  "location": "suburban",
  "year_built": 2000,
  "condition": "Good"
}'
```

Once you are satisfied, **remove** the test container.

```
docker rm -f api
```

## PART II - Packaging the web interface

**Switch** to the Streamlit directory.

```
cd streamlit_app
```

**Create** its Dockerfile.

`file: streamlit_app/Dockerfile`

```
FROM python:3.9-slim

WORKDIR /app

COPY  app.py requirements.txt .

RUN pip install -r requirements.txt

EXPOSE 8501

CMD  [ "streamlit", "run", "app.py", "--server.address=0.0.0.0" ]
```

Same `0.0.0.0` idea as before, this time through Streamlit's own flag.

**Build** it with a tag you could publish later.

`replace xxxx with your docker id`

```
docker image build -t xxxx/streamlit:v1 .
```

**Verify** and **run** it.

```
docker image ls
docker run -idt -p 8501:8501 --name web xxxx/streamlit:v1
docker ps -n 1
docker logs web
```

**Open** [http://localhost:8501](http://localhost:8501).

You would see the interface, but predictions would not work yet. That is expected. The
container has no idea where the API is. Fixing that is PART III.

**Remove** the test container and go back to the project root.

```
docker rm -f web
cd ..
```

## PART III - Running the stack with Compose

Two containers that have to find each other is exactly the problem Docker Compose solves. It
puts them on a shared network where each service can reach the other by name.

**Create** the compose file in the project root.

`file: house-price-predictor/docker-compose.yaml`

```
services:
  fastapi:
    image: xxxx/fastapi:dev
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - 8000:8000

  streamlit:
    image: xxxx/streamlit:dev
    build:
      context: ./streamlit_app
      dockerfile: Dockerfile
    ports:
      - 8501:8501
    environment:
      API_URL: http://fastapi:8000
```

`replace xxxx with your docker id in both image lines`

The line doing the real work here is `API_URL: http://fastapi:8000`. The hostname `fastapi` is
the service name from this file. Compose runs a small DNS server on the shared network, so
that name resolves to whichever container is running that service. You never have to know its
IP address.

Keep that idea in your head. In Lab 6 you would do exactly the same thing on Kubernetes, using
a Service name instead of a Compose service name. Same problem, same solution, different
platform.

**Build** both images through Compose.

```
docker compose build
docker image ls
```

**Bring the stack up.**

```
docker compose up -d
docker compose ps
```

[sample output]
```
CONTAINER ID  IMAGE                             COMMAND               CREATED         STATUS      PORTS                   NAMES
16848c53ba20  localhost/initcron/fastapi:dev    uvicorn main:app ...  45 seconds ago  Created     0.0.0.0:8000->8000/tcp  house-price-predictor_fastapi_1
2633c96a1682  localhost/initcron/streamlit:dev  streamlit run app...  45 seconds ago  Created     0.0.0.0:8501->8501/tcp  house-price-predictor_streamlit_1
```

**Verify** both are reachable.

  * API docs at [http://localhost:8000/docs](http://localhost:8000/docs)
  * Web interface at [http://localhost:8501/](http://localhost:8501/)

This time, enter some house details in the Streamlit form and press predict. You should get a
price back. The full path is now working, that is browser to Streamlit to FastAPI to model and
back.

#### Observe

Stop only the API container and try a prediction again.

```
docker compose stop fastapi
```

What does the Streamlit app show? Now start it again and retry.

```
docker compose start fastapi
```

Notice that the front end stayed up the whole time. Two separate services means one can fail
without taking the other down, and it also means you can update the model without touching the
interface at all.

## Troubleshooting - the image builds but the container dies

This happens often enough that it is worth walking through properly.

The symptom is that `docker run` appears to work, but `docker ps` does not show your
container. It started, something went wrong, and it exited.

The first move is always the same. **Look at the logs.**

```
docker logs api
```

`if the container already exited, docker ps -a will show it, and docker logs still works on it`

Three causes cover almost every case.

**The model file is not where the code expects it.** The Dockerfile copies the API code into
`/app`, and the `.pkl` files into `/app/models/trained/`. If `inference.py` looks somewhere
else, you would see a `FileNotFoundError` naming the exact path it tried. Look inside the
image to see what is actually there.

```
docker run -it --rm --entrypoint sh xxxxxx/house-price-model:dev
ls -la
ls -la models/trained/
```

**A package is missing.** The traceback would say `ModuleNotFoundError` and name it. That
usually means it is in the project's top level `requirements.txt` but not in
`src/api/requirements.txt`, which is the one the Dockerfile installs from.

**The port is already taken.** You would see something like this.

```
Error: unable to start container "16848c53ba2019f76bacd8f0427a47fe24de4fcf0360e1d07f1a4c35c09f3188": cannot listen on the TCP port: listen tcp4 :8000: bind: address already in use
Error: something went wrong with the request: "listen tcp :8501: bind: address already in use\n"
```

Something else on your machine is already using that port. Change the left hand side of the
port mapping, which is the host side, and leave the right hand side alone.

```
    ports:
      - 8005:8000
```

Now the service is reachable at 8005 on your machine while still listening on 8000 inside the
container.

The habit worth building here is to read the log before changing anything. The message almost
always names the file, the module or the port. Guessing is slower.

## Exercise

Rebuild the stack with a new model and prove the change reached the API.

  * Go back to Lab 3 and retrain with one hyperparameter changed, so that you get a different model
  * Rebuild only the API image
  * Bring the stack up again and send the same prediction request as before
  * Confirm the predicted price is different from the one you got earlier

Then answer this. How would you know, six months from now, which model version a running
container is serving? Right now you could not. Hold that thought, because it is the problem
image tagging solves in Lab 5.

## Cleanup

**Bring the stack down** when you are done.

```
docker compose down
```

**Commit** your work. You would need all of these files in the repository from Lab 5 onwards.

```
git status
```

[sample output]
```
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	Dockerfile
	configs/
	data/processed/cleaned_house_data.csv
	data/processed/featured_house_data.csv
	docker-compose.yaml
	streamlit_app/Dockerfile
```

```
git add .
git commit -am "add Dockerfiles along with compose"
git push origin main
```

#### Summary

In this lab you turned a model file into a running service. You read the API code that wraps
the model, wrote a Dockerfile that packages the code and the model together, built and tested
that image on its own, did the same for the Streamlit interface, and then ran both as a single
stack with Docker Compose.

You also met service discovery by name for the first time, where `http://fastapi:8000` works
because Compose resolves it for you. That same idea comes back in Lab 6 on Kubernetes.

And you learned to read a container log before guessing at a fix.

Everything so far has depended on you running commands by hand. In Lab 5 you would hand all of
it to a pipeline. A push to GitHub would process the data, train the model, build the image and
publish it to Docker Hub, without you being involved at all.

##### Reading List

  * [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/)
  * [Pydantic models and validation](https://docs.pydantic.dev/latest/concepts/models/)
  * [Dockerfile best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
  * [Docker Compose networking](https://docs.docker.com/compose/networking/)
  * [Streamlit documentation](https://docs.streamlit.io/)

## Search Keywords

  * fastapi uvicorn host 0.0.0.0
  * dockerfile python slim base image
  * docker layer caching copy order
  * docker logs exited container
  * docker compose service name dns
  * docker compose environment variable
  * port already in use docker
  * baked in model container image
